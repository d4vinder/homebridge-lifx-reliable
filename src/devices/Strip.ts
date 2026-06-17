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
  /** The strip's device-level power. Zones only light when this is on. */
  private devicePowerOn = false;

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
      const [color, state] = await Promise.all([
        this.device.getZoneColor(this.startIndex),
        this.device.getState(),
      ]);
      if (!color) {
        return false;
      }
      this.color = color;
      this.devicePowerOn = Boolean(state) && state.power > 0;
      if (color.brightness > 0) {
        this.lastOnBrightness = color.brightness;
      }
      return true;
    } catch {
      return false;
    }
  }

  /** A segment is only on when the strip is powered AND its zones are bright. */
  get on(): boolean {
    return this.devicePowerOn && this.color.brightness > 0;
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
    if (on) {
      this.color.brightness = this.lastOnBrightness;
      await this.ensureDevicePower();
      await this.push(this.durations.power);
    } else {
      // Dim this segment's zones to 0; leave the strip powered so other
      // segments keep working.
      this.color.brightness = 0;
      await this.push(this.durations.power);
    }
  }

  async setBrightness(value: number): Promise<void> {
    this.color.brightness = value;
    if (value > 0) {
      this.lastOnBrightness = value;
      await this.ensureDevicePower();
    }
    await this.push(this.durations.brightness);
  }

  /** Multizone zones only emit light when the strip's master power is on. */
  private async ensureDevicePower(): Promise<void> {
    if (!this.devicePowerOn) {
      await this.device.setPower(true, this.durations.power);
      this.devicePowerOn = true;
    }
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
