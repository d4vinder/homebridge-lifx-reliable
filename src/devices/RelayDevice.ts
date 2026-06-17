import { resolveProduct } from '../protocol/products';
import type { TransportDevice } from '../protocol/transport';
import type { FirmwareVersion } from '../types';

/**
 * Model of a LIFX switch (a device exposing up to four relays). Each relay is
 * surfaced to HomeKit as its own accessory; this class is shared across them
 * and addressed by relay index.
 */
export class RelayDevice {
  private readonly power: number[] = [0, 0, 0, 0];
  private label = '';
  private firmware: FirmwareVersion = { majorVersion: 0, minorVersion: 0 };
  private productName?: string;
  private vendorName?: string;

  constructor(
    private readonly device: TransportDevice,
    baseName: string,
  ) {
    this.label = baseName;
  }

  async init(onSoftError: (err: Error) => void): Promise<boolean> {
    await this.safe(async () => {
      this.firmware = await this.device.getFirmware();
    }, onSoftError);

    await this.safe(async () => {
      const hw = (await this.device.getHardware()) as { productId?: number } | undefined;
      const resolved = resolveProduct(hw?.productId, this.firmware);
      if (resolved) {
        this.productName = resolved.productName;
        this.vendorName = resolved.vendorName;
      }
    }, onSoftError);

    // Reachable if at least one relay answers.
    const results = await Promise.all([0, 1, 2, 3].map((i) => this.pull(i)));
    return results.some(Boolean);
  }

  private async safe(fn: () => Promise<void>, onSoftError: (err: Error) => void): Promise<void> {
    try {
      await fn();
    } catch (err) {
      onSoftError(err instanceof Error ? err : new Error(String(err)));
    }
  }

  /** Refresh a single relay's cached power. Returns reachability. */
  async pull(index: number): Promise<boolean> {
    try {
      const value = await this.device.getRelayPower(index);
      if (value !== null && value !== undefined) {
        this.power[index] = value;
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  get serialNumber(): string {
    return this.device.id;
  }

  get name(): string {
    return this.label;
  }

  get version(): string {
    return `${this.firmware.majorVersion}.${this.firmware.minorVersion}`;
  }

  get vendor(): string {
    return this.vendorName ?? 'LIFX';
  }

  get product(): string {
    return this.productName ?? 'LIFX Switch';
  }

  isOn(index: number): boolean {
    return this.power[index] > 0;
  }

  async setOn(index: number, on: boolean): Promise<void> {
    this.power[index] = on ? 1 : 0;
    await this.device.setRelayPower(index, on);
  }
}
