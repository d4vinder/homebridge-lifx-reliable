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

function makeStripDevice(zoneColor: Hsbk): {
  device: TransportDevice;
  calls: ZoneCall[];
} {
  const calls: ZoneCall[] = [];
  const device = {
    id: 'd073d5strip',
    address: '192.168.1.30',
    getZoneColor: async (_index: number) => ({ ...zoneColor }),
    setZoneColors: async (startIndex: number, endIndex: number, color: Hsbk, durationMs: number) => {
      calls.push({ startIndex, endIndex, color: { ...color }, durationMs });
    },
  } as unknown as TransportDevice;
  return { device, calls };
}

describe('StripSegment', () => {
  it('pulls its representative zone colour and reports on/off via brightness', async () => {
    const { device } = makeStripDevice({ hue: 200, saturation: 80, brightness: 70, kelvin: 3500 });
    const seg = new StripSegment(device, 'Worktop 1', 0, 6, durations);

    expect(await seg.init()).toBe(true);
    expect(seg.on).toBe(true);
    expect(seg.brightness).toBe(70);
    expect(seg.hue).toBe(200);
    expect(seg.saturation).toBe(80);
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

  it('turns off by setting brightness 0 and restores the last level on', async () => {
    const { device, calls } = makeStripDevice({ hue: 0, saturation: 0, brightness: 60, kelvin: 3500 });
    const seg = new StripSegment(device, 'Worktop 3', 30, 44, durations);
    await seg.init();

    await seg.setOn(false);
    expect(calls[0].color.brightness).toBe(0);
    expect(seg.on).toBe(false);

    await seg.setOn(true);
    expect(calls[1].color.brightness).toBe(60); // restored, not stuck at 0
    expect(seg.on).toBe(true);
  });

  it('reports unreachable when the zone read fails', async () => {
    const device = {
      id: 'x',
      address: 'y',
      getZoneColor: async () => {
        throw new Error('timeout');
      },
    } as unknown as TransportDevice;
    const seg = new StripSegment(device, 'Worktop 4', 45, 58, durations);

    expect(await seg.pull()).toBe(false);
  });
});
