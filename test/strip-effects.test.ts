import { describe, it, expect } from 'vitest';

import { MultizoneStrip } from '../src/devices/Strip';
import { STRIP_THEMES } from '../src/protocol/themes';
import type { TransportDevice } from '../src/protocol/transport';
import type { Hsbk } from '../src/types';

interface Recorder {
  power: boolean[];
  move: Array<{ on: boolean; speedMs: number; direction: string }>;
  zones: Array<{ start: number; end: number; color: Hsbk }>;
}

function makeDevice(): { device: TransportDevice; calls: Recorder } {
  const calls: Recorder = { power: [], move: [], zones: [] };
  const device = {
    setPower: async (on: boolean) => {
      calls.power.push(on);
    },
    setMoveEffect: async (on: boolean, speedMs: number, direction: string) => {
      calls.move.push({ on, speedMs, direction });
    },
    setZoneColors: async (start: number, end: number, color: Hsbk) => {
      calls.zones.push({ start, end, color: { ...color } });
    },
  } as unknown as TransportDevice;
  return { device, calls };
}

describe('MultizoneStrip', () => {
  it('maps fan speed to a cycle period (higher % = faster)', () => {
    expect(MultizoneStrip.speedToMs(100)).toBe(500);
    expect(MultizoneStrip.speedToMs(1)).toBeGreaterThan(MultizoneStrip.speedToMs(100));
    expect(MultizoneStrip.speedToMs(50)).toBeGreaterThan(MultizoneStrip.speedToMs(80));
  });

  it('starting Move powers the strip on and starts the firmware effect', async () => {
    const { device, calls } = makeDevice();
    const strip = new MultizoneStrip(device, 59, 0);

    await strip.setMove(true, 60, 'AWAY');

    expect(calls.power).toContain(true);
    expect(calls.move).toHaveLength(1);
    expect(calls.move[0]).toMatchObject({ on: true, direction: 'AWAY' });
    expect(calls.move[0].speedMs).toBe(MultizoneStrip.speedToMs(60));
  });

  it('stopping Move sends OFF without forcing power', async () => {
    const { device, calls } = makeDevice();
    const strip = new MultizoneStrip(device, 59, 0);

    await strip.setMove(false, 60, 'TOWARDS');

    expect(calls.power).toHaveLength(0);
    expect(calls.move[0].on).toBe(false);
  });

  it('paints a theme as contiguous bands covering every zone', async () => {
    const { device, calls } = makeDevice();
    const strip = new MultizoneStrip(device, 59, 0);
    const stops = STRIP_THEMES[0].stops; // Rainbow, 8 stops

    await strip.applyTheme(stops, 300);

    expect(calls.power).toContain(true);
    expect(calls.zones).toHaveLength(stops.length);
    // Bands are gap-free and cover the whole strip.
    expect(calls.zones[0].start).toBe(0);
    expect(calls.zones.at(-1)?.end).toBe(58);
    for (let i = 1; i < calls.zones.length; i++) {
      expect(calls.zones[i].start).toBe(calls.zones[i - 1].end + 1);
    }
  });
});
