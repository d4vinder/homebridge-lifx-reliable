/**
 * Colour-temperature conversion helpers.
 *
 * HomeKit expresses colour temperature in mireds (reciprocal megakelvin);
 * LIFX expresses it in kelvin. The two are simple reciprocals. LIFX bulbs have a
 * native white channel, so colour temperature is rendered directly from the
 * kelvin value (with zero saturation) — no RGB/black-body approximation needed.
 */

/** kelvin <-> mired are reciprocals: mired = 1e6 / kelvin. */
export const kelvinToMired = (kelvin: number): number => 1_000_000 / kelvin;
export const miredToKelvin = (mired: number): number => 1_000_000 / mired;
