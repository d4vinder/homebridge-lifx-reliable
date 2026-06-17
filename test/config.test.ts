import { describe, it, expect } from 'vitest';

import { resolveConfig, type LifxPluginConfig } from '../src/types';

const base = { platform: 'LifxReliable', name: 'LIFX Reliable' } as LifxPluginConfig;

describe('resolveConfig', () => {
  it('applies the documented defaults when fields are absent', () => {
    const c = resolveConfig(base);
    expect(c.pollIntervalMs).toBe(5000);
    expect(c.pollJitterMs).toBe(1500);
    expect(c.lightOfflineTolerance).toBe(3);
    expect(c.brightnessDuration).toBe(300);
    expect(c.colorDuration).toBe(300);
    expect(c.duration).toBe(0);
    expect(c.bindAddress).toBe('0.0.0.0');
    expect(c.broadcast).toBe('255.255.255.255');
    expect(c.autoDiscover).toBe(true);
    expect(c.exposeFirmware).toBe(true);
    expect(c.debug).toBe(false);
    expect(c.removeStaleAccessories).toBe(false);
    expect(c.staleAccessoryDelaySeconds).toBe(30);
    expect(c.bulbs).toEqual([]);
    expect(c.switches).toEqual([]);
    expect(c.excludes).toEqual([]);
  });

  it('keeps explicitly provided values', () => {
    const c = resolveConfig({ ...base, pollIntervalMs: 8000, autoDiscover: false, debug: true });
    expect(c.pollIntervalMs).toBe(8000);
    expect(c.autoDiscover).toBe(false);
    expect(c.debug).toBe(true);
  });

  it('falls back to defaults on wrong types rather than trusting them', () => {
    const c = resolveConfig({
      ...base,
      pollIntervalMs: 'fast' as unknown as number,
      debug: 'yes' as unknown as boolean,
      bulbs: 'nope' as unknown as [],
    });
    expect(c.pollIntervalMs).toBe(5000);
    expect(c.debug).toBe(false);
    expect(c.bulbs).toEqual([]);
  });

  it('rejects non-finite numbers', () => {
    const c = resolveConfig({ ...base, pollIntervalMs: NaN, pollJitterMs: Infinity });
    expect(c.pollIntervalMs).toBe(5000);
    expect(c.pollJitterMs).toBe(1500);
  });
});
