import type { TransportDevice } from '../protocol/transport';
import type { Hsbk } from '../types';

export interface SegmentDurations {
  power: number;
  brightness: number;
  colour: number;
}

/**
 * One contiguous range of zones on a multizone strip (LIFX Z / Beam), modelled
 * as a single HomeKit colour light. Zones have no individual power line, so
 * on/off is expressed as brightness (0 = off), remembering the last on-level so
 * toggling back on restores it.
 */
export class StripSegment {
  private color: Hsbk = { hue: 0, saturation: 0, brightness: 0, kelvin: 3500 };
  private lastOnBrightness = 100;

  constructor(
    private readonly device: TransportDevice,
    public readonly name: string,
    public readonly startIndex: number,
    public readonly endIndex: number,
    private readonly durations: SegmentDurations,
  ) {}

  init(): Promise<boolean> {
    return this.pull();
  }

  /** Refresh from the strip using the segment's first zone as representative. */
  async pull(): Promise<boolean> {
    try {
      const color = await this.device.getZoneColor(this.startIndex);
      if (!color) {
        return false;
      }
      this.color = color;
      if (color.brightness > 0) {
        this.lastOnBrightness = color.brightness;
      }
      return true;
    } catch {
      return false;
    }
  }

  get on(): boolean {
    return this.color.brightness > 0;
  }

  get brightness(): number {
    return this.color.brightness;
  }

  get hue(): number {
    return this.color.hue;
  }

  get saturation(): number {
    return this.color.saturation;
  }

  async setOn(on: boolean): Promise<void> {
    this.color.brightness = on ? this.lastOnBrightness : 0;
    await this.push(this.durations.power);
  }

  async setBrightness(value: number): Promise<void> {
    this.color.brightness = value;
    if (value > 0) {
      this.lastOnBrightness = value;
    }
    await this.push(this.durations.brightness);
  }

  async setHue(value: number): Promise<void> {
    this.color.hue = value;
    await this.push(this.durations.colour);
  }

  async setSaturation(value: number): Promise<void> {
    this.color.saturation = value;
    await this.push(this.durations.colour);
  }

  private async push(durationMs: number): Promise<void> {
    await this.device.setZoneColors(this.startIndex, this.endIndex, this.color, durationMs);
  }
}
