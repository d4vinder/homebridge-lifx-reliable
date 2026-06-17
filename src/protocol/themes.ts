import type { Hsbk } from '../types';

export interface StripTheme {
  name: string;
  stops: Hsbk[];
}

const K = 3500;
const stop = (hue: number, saturation: number, brightness: number): Hsbk => ({
  hue,
  saturation,
  brightness,
  kelvin: K,
});

/**
 * Built-in palettes painted across a multizone strip. Each stop fills an equal
 * band of zones; combined with the Move effect they animate like the LIFX app's
 * moving themes.
 */
export const STRIP_THEMES: StripTheme[] = [
  {
    name: 'Rainbow',
    stops: [0, 45, 90, 135, 180, 225, 270, 315].map((h) => stop(h, 100, 80)),
  },
  {
    name: 'Sunset',
    stops: [stop(25, 100, 75), stop(8, 95, 70), stop(330, 90, 65), stop(285, 85, 60)],
  },
  {
    name: 'Ocean',
    stops: [stop(200, 100, 70), stop(190, 90, 65), stop(220, 85, 70), stop(170, 75, 60)],
  },
  {
    name: 'Forest',
    stops: [stop(120, 90, 60), stop(95, 85, 65), stop(150, 75, 55), stop(70, 70, 60)],
  },
  {
    name: 'Fire',
    stops: [stop(8, 100, 65), stop(30, 100, 70), stop(0, 100, 60), stop(45, 90, 65)],
  },
];
