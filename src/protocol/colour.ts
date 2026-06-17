/**
 * Colour-temperature conversion helpers.
 *
 * HomeKit expresses colour temperature in mireds (reciprocal megakelvin);
 * LIFX expresses it in kelvin. HomeKit also models a warm-to-cool slider as an
 * HSB point, so when the user drags the temperature slider we must synthesise a
 * plausible hue/saturation for the bulb to render.
 *
 * The black-body RGB approximation below is the well-known Tanner Helland curve
 * (public-domain algorithm). It is reimplemented here from the published formula
 * rather than copied, and isolated in one place so it is unit-testable.
 */

const clamp = (v: number, lo: number, hi: number): number => Math.min(Math.max(v, lo), hi);

/** kelvin <-> mired are reciprocals: mired = 1e6 / kelvin. */
export const kelvinToMired = (kelvin: number): number => 1_000_000 / kelvin;
export const miredToKelvin = (mired: number): number => 1_000_000 / mired;

/** Approximate sRGB (0-1) for a colour temperature, via the black-body curve. */
function temperatureToRgb(mired: number): [number, number, number] {
  const t = 10_000 / mired; // "dKelvin" working value from the original formula
  const r =
    t > 66
      ? 351.97690566805693 + 0.114206453784165 * (t - 55) - 40.25366309332127 * Math.log(t - 55)
      : 255;
  const g =
    t > 66
      ? 325.4494125711974 + 0.07943456536662342 * (t - 50) - 28.0852963507957 * Math.log(t - 55)
      : 104.49216199393888 * Math.log(t - 2) - 0.44596950469579133 * (t - 2) - 155.25485562709179;
  const b =
    t > 66
      ? 255
      : 115.67994401066147 * Math.log(t - 10) + 0.8274096064007395 * (t - 10) - 254.76935184120902;
  return [r, g, b].map((v) => clamp(v, 0, 255) / 255) as [number, number, number];
}

/**
 * Convert a HomeKit colour-temperature value (mireds) into the hue/saturation
 * the bulb should display so the warm/cool slider looks right.
 */
export function miredToHueSaturation(mired: number): { hue: number; saturation: number } {
  const [r, g, b] = temperatureToRgb(mired);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;

  let hue = 0;
  if (delta) {
    if (max === r) {
      hue = (g - b) / delta + (g < b ? 6 : 0);
    } else if (max === g) {
      hue = (b - r) / delta + 2;
    } else {
      hue = (r - g) / delta + 4;
    }
    hue *= 60;
  }

  const saturation = max ? (100 * delta) / max : 0;
  return { hue: Math.round(hue), saturation: Math.round(saturation) };
}
