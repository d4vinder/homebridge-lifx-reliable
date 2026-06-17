import { describe, it, expect } from 'vitest';

import { resolveProduct } from '../src/protocol/products';

describe('resolveProduct', () => {
  it('returns undefined for a missing or unknown product id', () => {
    expect(resolveProduct(undefined, { majorVersion: 3, minorVersion: 0 })).toBeUndefined();
    expect(resolveProduct(999999, { majorVersion: 3, minorVersion: 0 })).toBeUndefined();
  });

  it('resolves a known colour bulb (pid 1) with its kelvin range', () => {
    const p = resolveProduct(1, { majorVersion: 3, minorVersion: 0 });
    expect(p?.productName).toBe('LIFX Original 1000');
    expect(p?.vendorName).toBe('LIFX');
    expect(p?.features.color).toBe(true);
    expect(p?.features.hasRelays).toBe(false);
    expect(p?.features.temperatureRange).toEqual([2500, 9000]);
  });

  it('applies firmware-gated feature upgrades (pid 27 A19 widens range at fw 2.80)', () => {
    const older = resolveProduct(27, { majorVersion: 2, minorVersion: 79 });
    expect(older?.features.temperatureRange).toEqual([2500, 9000]);

    const upgraded = resolveProduct(27, { majorVersion: 2, minorVersion: 80 });
    expect(upgraded?.features.temperatureRange).toEqual([1500, 9000]);
  });

  it('flags relay/switch products as having relays', () => {
    const sw = resolveProduct(70, { majorVersion: 3, minorVersion: 0 });
    expect(sw?.features.hasRelays).toBe(true);
    expect(sw?.features.temperatureRange).toBeUndefined();
  });
});
