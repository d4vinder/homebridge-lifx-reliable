import { describe, it, expect } from 'vitest';

import { kelvinToMired, miredToKelvin } from '../src/protocol/colour';

describe('colour conversions', () => {
  it('treats kelvin and mired as reciprocals (1e6 / x)', () => {
    expect(kelvinToMired(5000)).toBe(200);
    expect(miredToKelvin(200)).toBe(5000);
    expect(kelvinToMired(2700)).toBeCloseTo(370.37, 1);
  });

  it('round-trips kelvin -> mired -> kelvin', () => {
    for (const k of [1500, 2500, 3500, 4000, 6500, 9000]) {
      expect(miredToKelvin(kelvinToMired(k))).toBeCloseTo(k, 6);
    }
  });
});
