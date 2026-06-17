import { describe, it, expect } from 'vitest';

import { Light } from '../src/devices/Light';
import { kelvinToMired } from '../src/protocol/colour';
import type { TransportDevice } from '../src/protocol/transport';
import type { Hsbk } from '../src/types';

const durations = { power: 0, brightness: 300, colour: 300 };

interface Recorder {
  setColor: Array<{ color: Hsbk; durationMs: number }>;
  setPower: Array<{ on: boolean; durationMs: number }>;
}

function makeDevice(overrides: Partial<TransportDevice> = {}): {
  device: TransportDevice;
  calls: Recorder;
} {
  const calls: Recorder = { setColor: [], setPower: [] };
  const device: TransportDevice = {
    id: 'd073d5000001',
    address: '192.168.1.50',
    getFirmware: async () => ({ majorVersion: 3, minorVersion: 0 }),
    getHardware: async () => ({ productId: 1 }), // LIFX Original 1000: colour, 2500-9000K
    getState: async () => ({
      color: { hue: 120, saturation: 50, brightness: 80, kelvin: 4000 },
      power: 65535,
      label: 'Test Bulb',
    }),
    getLabel: async () => 'Test Bulb',
    hasRelays: async () => false,
    setColor: async (color, durationMs) => {
      calls.setColor.push({ color: { ...color }, durationMs });
    },
    setPower: async (on, durationMs) => {
      calls.setPower.push({ on, durationMs });
    },
    getRelayPower: async () => 0,
    setRelayPower: async () => undefined,
    ...overrides,
  };
  return { device, calls };
}

describe('Light', () => {
  it('initialises, pulls state and resolves capabilities', async () => {
    const { device } = makeDevice();
    const light = new Light(device, durations);

    const reachable = await light.init(() => undefined);

    expect(reachable).toBe(true);
    expect(light.name).toBe('Test Bulb');
    expect(light.on).toBe(true);
    expect(light.hasColour).toBe(true);
    expect(light.hasKelvin).toBe(true);
    expect(light.product).toBe('LIFX Original 1000');
  });

  it('renders colour temperature as native white (saturation 0), not an RGB tint', async () => {
    const { device, calls } = makeDevice();
    const light = new Light(device, durations);
    await light.init(() => undefined);

    await light.setColorTemperature(kelvinToMired(2700));

    expect(calls.setColor).toHaveLength(1);
    expect(calls.setColor[0].color.saturation).toBe(0);
    expect(calls.setColor[0].color.hue).toBe(0);
    expect(calls.setColor[0].color.kelvin).toBeCloseTo(2700, 3);
  });

  it('clamps colour temperature to the bulb kelvin range', async () => {
    const { device, calls } = makeDevice();
    const light = new Light(device, durations);
    await light.init(() => undefined);

    await light.setColorTemperature(kelvinToMired(1000)); // below the 2500K floor

    expect(calls.setColor[0].color.kelvin).toBe(2500);
  });

  it('drives power with the configured fade duration', async () => {
    const { device, calls } = makeDevice();
    const light = new Light(device, durations);
    await light.init(() => undefined);

    await light.setOn(false);

    expect(calls.setPower).toEqual([{ on: false, durationMs: 0 }]);
  });

  it('reports unreachable (pull -> false) when the device times out', async () => {
    const { device } = makeDevice({
      getState: async () => {
        throw new Error('LIFX getState timed out');
      },
    });
    const light = new Light(device, durations);

    expect(await light.pull()).toBe(false);
  });

  it('survives hardware/firmware lookup failures without rejecting', async () => {
    const { device } = makeDevice({
      getFirmware: async () => {
        throw new Error('no firmware');
      },
      getHardware: async () => {
        throw new Error('no hardware');
      },
    });
    const light = new Light(device, durations);

    const reachable = await light.init(() => undefined);
    expect(reachable).toBe(true); // state still pulled; lookups degraded gracefully
    expect(light.vendor).toBe('LIFX'); // falls back to sane defaults
  });
});
