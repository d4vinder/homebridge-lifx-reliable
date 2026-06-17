import { kelvinToMired, miredToKelvin } from '../protocol/colour';
import { resolveProduct } from '../protocol/products';
import type { TransportDevice } from '../protocol/transport';
import type { DeviceFeatures, FirmwareVersion, Hsbk, LightState } from '../types';

export interface DurationSettings {
  power: number;
  brightness: number;
  colour: number;
}

const DEFAULT_KELVIN_RANGE: [number, number] = [2500, 9000];

/**
 * High-level model of a single LIFX bulb. Owns the cached state and feature
 * resolution; all I/O is async and returns reachability rather than throwing
 * into the HomeKit layer.
 */
export class Light {
  private state: LightState = {
    color: { hue: 0, saturation: 0, brightness: 100, kelvin: 3500 },
    power: 0,
    label: '',
  };

  private firmware: FirmwareVersion = { majorVersion: 0, minorVersion: 0 };
  private features: DeviceFeatures = { color: false, hasRelays: false };
  private productName?: string;
  private vendorName?: string;

  constructor(
    private readonly device: TransportDevice,
    private readonly durations: DurationSettings,
  ) {}

  /**
   * One-shot initialisation. Resolves true if the bulb answered and we have a
   * usable state, false if it was unreachable. Never rejects: hardware/firmware
   * lookup failures degrade gracefully so a single odd device cannot crash the
   * bridge.
   */
  async init(onSoftError: (err: Error) => void): Promise<boolean> {
    await this.safe(async () => {
      this.firmware = await this.device.getFirmware();
    }, onSoftError);

    await this.safe(async () => {
      const hw = (await this.device.getHardware()) as { productId?: number } | undefined;
      const resolved = resolveProduct(hw?.productId, this.firmware);
      if (resolved) {
        this.features = resolved.features;
        this.productName = resolved.productName;
        this.vendorName = resolved.vendorName;
      }
    }, onSoftError);

    return this.pull();
  }

  private async safe(fn: () => Promise<void>, onSoftError: (err: Error) => void): Promise<void> {
    try {
      await fn();
    } catch (err) {
      onSoftError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /** Refresh cached state from the device. Returns reachability. */
  async pull(): Promise<boolean> {
    try {
      const state = await this.device.getState();
      if (state && state.color) {
        this.state = state;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  // ---- identity / capabilities -------------------------------------------

  get serialNumber(): string {
    return this.device.id;
  }

  get name(): string {
    return this.state.label;
  }

  get version(): string {
    return `${this.firmware.majorVersion}.${this.firmware.minorVersion}`;
  }

  get vendor(): string {
    return this.vendorName ?? 'LIFX';
  }

  get product(): string {
    return this.productName ?? 'LIFX Bulb';
  }

  get hasColour(): boolean {
    return this.features.color;
  }

  get hasKelvin(): boolean {
    return this.features.temperatureRange !== undefined;
  }

  private get kelvinRange(): [number, number] {
    return this.features.temperatureRange ?? DEFAULT_KELVIN_RANGE;
  }

  /** HomeKit ColorTemperature props are in mireds; cooler kelvin = smaller mired. */
  get minColorTemperature(): number {
    return Math.floor(kelvinToMired(this.kelvinRange[1]));
  }

  get maxColorTemperature(): number {
    return Math.ceil(kelvinToMired(this.kelvinRange[0]));
  }

  // ---- getters (cached) ---------------------------------------------------

  get on(): boolean {
    return this.state.power > 0;
  }

  get brightness(): number {
    return this.state.color.brightness;
  }

  get hue(): number {
    return this.state.color.hue;
  }

  get saturation(): number {
    return this.state.color.saturation;
  }

  get colorTemperature(): number {
    const mired = kelvinToMired(this.state.color.kelvin);
    return Math.min(Math.max(this.minColorTemperature, mired), this.maxColorTemperature);
  }

  // ---- setters ------------------------------------------------------------

  async setOn(on: boolean): Promise<void> {
    this.state.power = on ? 1 : 0;
    await this.device.setPower(on, this.durations.power);
  }

  async setBrightness(value: number): Promise<void> {
    this.state.color.brightness = value;
    await this.push(this.durations.brightness);
  }

  async setHue(value: number): Promise<void> {
    this.state.color.hue = value;
    await this.push(this.durations.colour);
  }

  async setSaturation(value: number): Promise<void> {
    this.state.color.saturation = value;
    await this.push(this.durations.colour);
  }

  async setColorTemperature(mired: number): Promise<void> {
    const [lo, hi] = this.kelvinRange;
    // LIFX bulbs have a dedicated white channel: render colour temperature
    // natively via the kelvin field with zero saturation, instead of tinting the
    // bulb with an RGB approximation of the black body. saturation:0 is what
    // makes HomeKit's warm/cool slider (and Adaptive Lighting) produce clean
    // white rather than a saturated orange/blue.
    this.state.color.hue = 0;
    this.state.color.saturation = 0;
    this.state.color.kelvin = Math.min(Math.max(lo, miredToKelvin(mired)), hi);
    await this.push(this.durations.colour);
  }

  private async push(durationMs: number): Promise<void> {
    const c: Hsbk = this.state.color;
    await this.device.setColor(c, durationMs);
  }
}
