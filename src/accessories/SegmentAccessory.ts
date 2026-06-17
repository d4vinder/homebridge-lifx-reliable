import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { LifxHomebridgePlatform } from '../platform';
import { StripSegment } from '../devices/Strip';
import { BaseAccessory } from './BaseAccessory';

/** A single multizone segment exposed as a HomeKit colour Lightbulb. */
export class SegmentAccessory extends BaseAccessory {
  private readonly service: Service;

  constructor(
    platform: LifxHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly segment: StripSegment,
    deviceId: string,
  ) {
    super(platform, accessory, deviceId);

    this.service =
      accessory.getService(platform.Service.Lightbulb) ??
      accessory.addService(platform.Service.Lightbulb);

    // Register onGet immediately so HomeKit gets a clean "Not Responding"
    // before init() resolves.
    this.service.getCharacteristic(platform.Characteristic.On).onGet(this.getOn.bind(this));

    void this.segment
      .init()
      .then((reachable) => {
        this.bindCharacteristics();
        this.service.setCharacteristic(platform.Characteristic.Name, this.segment.name);
        this.goLive(reachable);
      })
      .catch((err) =>
        this.platform.log.error(
          `Failed to set up ${this.segment.name}:`,
          err instanceof Error ? err.message : String(err),
        ),
      );
  }

  protected primaryService(): Service {
    return this.service;
  }

  protected displayName(): string {
    return this.segment.name;
  }

  private bindCharacteristics(): void {
    const C = this.platform.Characteristic;
    this.service
      .getCharacteristic(C.On)
      .onGet(this.getOn.bind(this))
      .onSet(this.wrapSet((v) => this.segment.setOn(Boolean(v))));
    this.service
      .getCharacteristic(C.Brightness)
      .onSet(this.wrapSet((v) => this.segment.setBrightness(Number(v))));
    this.service.getCharacteristic(C.Hue).onSet(this.wrapSet((v) => this.segment.setHue(Number(v))));
    this.service
      .getCharacteristic(C.Saturation)
      .onSet(this.wrapSet((v) => this.segment.setSaturation(Number(v))));
  }

  private wrapSet(fn: (value: CharacteristicValue) => Promise<void>) {
    return async (value: CharacteristicValue): Promise<void> => {
      this.restartPolling();
      try {
        await fn(value);
      } catch (err) {
        this.platform.log.warn(`Set failed on ${this.segment.name}:`, (err as Error).message);
        throw this.notRespondingError();
      }
    };
  }

  private async getOn(): Promise<CharacteristicValue> {
    if (!this.online) {
      throw this.notRespondingError();
    }
    return this.segment.on;
  }

  protected async poll(): Promise<boolean> {
    return this.segment.pull();
  }

  protected pushCharacteristics(): void {
    const C = this.platform.Characteristic;
    this.service.updateCharacteristic(C.On, this.segment.on);
    this.service.updateCharacteristic(C.Brightness, this.segment.brightness);
    this.service.updateCharacteristic(C.Hue, this.segment.hue);
    this.service.updateCharacteristic(C.Saturation, this.segment.saturation);
  }
}
