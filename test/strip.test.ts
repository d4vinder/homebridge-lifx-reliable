import { describe, it, expect } from 'vitest';

import { StripSegment } from '../src/devices/Strip';
import type { TransportDevice } from '../src/protocol/transport';
import type { Hsbk } from '../src/types';

const durations = { power: 0, brightness: 300, colour: 300 };

interface ZoneCall {
  startIndex: number;
  endIndex: number;
  color: Hsbk;
  durationMs: number;
}

function makeStripDevice(
  zoneColor: Hsbk,
  power = 65535,
): {
  device: TransportDevice;
  calls: ZoneCall[];
  powerCalls: boolean[];
} {
  const calls: ZoneCall[] = [];
  const powerCalls: boolean[] = [];
  let devicePower = power;
  const device = {
    id: 'd073d5strip',
    address: '192.168.1.30',
    getState: async () => ({ color: { ...zoneColor }, power: devicePower, label: 'Strip' }),
    getZoneColor: async (_index: number) => ({ ...zoneColor }),
    setZoneColors: async (startIndex: number, endIndex: number, color: Hsbk, durationMs: number) => {
      calls.push({ startIndex, endIndex, color: { ...color }, durationMs });
    },
    setPower: async (on: boolean) => {
      powerCalls.push(on);
      devicePower = on ? 65535 : 0;
    },
  } as unknown as TransportDevice;
  return { device, calls, powerCalls };
}

describe('StripSegment', () => {
  it('is on only when the strip is powered and its zones are bright', async () => {
    const lit = makeStripDevice({ hue: 200, saturation: 80, brightness: 70, kelvin: 3500 }, 65535);
    const litSeg = new StripSegment(lit.device, 'Worktop 1', 0, 6, durations);
    expect(await litSeg.init()).toBe(true);
    expect(litSeg.on).toBe(true);
    expect(litSeg.brightness).toBe(70);
    expect(litSeg.hue).toBe(200);

    // Bright zones but the strip master power is OFF -> segment is off.
    const dark = makeStripDevice({ hue: 200, saturation: 80, brightness: 70, kelvin: 3500 }, 0);
    const darkSeg = new StripSegment(dark.device, 'Worktop 1', 0, 6, durations);
    await darkSeg.init();
    expect(darkSeg.on).toBe(false);
  });

  it('turning a segment on powers the strip on (the fix)', async () => {
    const { device, powerCalls } = makeStripDevice({ hue: 0, saturation: 0, brightness: 100, kelvin: 3500 }, 0);
    const seg = new StripSegment(device, 'Worktop 1', 0, 6, durations);
    await seg.init();
    expect(seg.on).toBe(false); // strip was off

    await seg.setOn(true);
    expect(powerCalls).toContain(true); // master power turned on
    expect(seg.on).toBe(true);
  });

  it('writes only its own zone range when colour changes', async () => {
    const { device, calls } = makeStripDevice({ hue: 0, saturation: 0, brightness: 50, kelvin: 3500 });
    const seg = new StripSegment(device, 'Worktop 2', 15, 29, durations);
    await seg.init();

    await seg.setHue(120);

    expect(calls).toHaveLength(1);
    expect(calls[0].startIndex).toBe(15);
    expect(calls[0].endIndex).toBe(29);
    expect(calls[0].color.hue).toBe(120);
  });

  it('turns off by dimming its zones to 0 and restores the last level on', async () => {
    const { device, calls } = makeStripDevice({ hue: 0, saturation: 0, brightness: 60, kelvin: 3500 }, 65535);
    const seg = new StripSegment(device, 'Worktop 3', 30, 44, durations);
    await seg.init();

    await seg.setOn(false);
    expect(calls.at(-1)?.color.brightness).toBe(0);
    expect(seg.on).toBe(false);

    await seg.setOn(true);
    expect(calls.at(-1)?.color.brightness).toBe(60); // restored, not stuck at 0
    expect(seg.on).toBe(true);
  });

  it('reports unreachable when the zone read fails', async () => {
    const device = {
      id: 'x',
      address: 'y',
      getState: async () => ({ color: { hue: 0, saturation: 0, brightness: 0, kelvin: 3500 }, power: 0, label: '' }),
      getZoneColor: async () => {
        throw new Error('timeout');
      },
    } as unknown as TransportDevice;
    const seg = new StripSegment(device, 'Worktop 4', 45, 58, durations);

    expect(await seg.pull()).toBe(false);
  });
});
