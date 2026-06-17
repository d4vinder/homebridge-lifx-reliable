import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { LifxHomebridgePlatform } from '../platform';
import { Light } from '../devices/Light';
import { BaseAccessory } from './BaseAccessory';

export class LightAccessory extends BaseAccessory {
  private readonly service: Service;

  constructor(
    platform: LifxHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly bulb: Light,
    lightId: string,
  ) {
    super(platform, accessory, lightId);

    this.service =
      accessory.getService(platform.Service.Lightbulb) ??
      accessory.addService(platform.Service.Lightbulb);

    // Register onGet immediately so HomeKit gets a clean "Not Responding"
    // even before init() resolves or if the bulb is dead at startup.
    this.service
      .getCharacteristic(platform.Characteristic.On)
      .onGet(this.getOn.bind(this));

    void this.bulb
      .init((err) => this.platform.log.warn(`Bulb ${this.bulb.name} init warning:`, err.message))
      .then((reachable) => {
        this.applyHardware();
        this.applyFirmware();
        this.bindCharacteristics();
        this.goLive(reachable);
      })
      .catch((err) =>
        this.platform.log.error(
          `Failed to set up ${this.bulb.name}:`,
          err instanceof Error ? err.message : String(err),
        ),
      );
  }

  protected primaryService(): Service {
    return this.service;
  }

  protected displayName(): string {
    return this.bulb.name;
  }

  private applyHardware(): void {
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, this.bulb.vendor)
      .setCharacteristic(this.platform.Characteristic.Model, this.bulb.product)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.bulb.serialNumber);
  }

  private applyFirmware(): void {
    if (this.bulb.version !== '0.0' && this.platform.settings.exposeFirmware) {
      const info = this.accessory.getService(this.platform.Service.AccessoryInformation)!;
      info.setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.bulb.version);
    }
    this.service.setCharacteristic(this.platform.Characteristic.Name, this.bulb.name);
  }

  private bindCharacteristics(): void {
    const C = this.platform.Characteristic;

    this.service
      .getCharacteristic(C.On)
      .onGet(this.getOn.bind(this))
      .onSet(this.wrapSet((v) => this.bulb.setOn(Boolean(v))));

    this.service
      .getCharacteristic(C.Brightness)
      .onSet(this.wrapSet((v) => this.bulb.setBrightness(Number(v))));

    if (this.bulb.hasKelvin) {
      this.service
        .getCharacteristic(C.ColorTemperature)
        .setProps({
          minValue: this.bulb.minColorTemperature,
          maxValue: this.bulb.maxColorTemperature,
        })
        .onSet(this.wrapSet((v) => this.bulb.setColorTemperature(Number(v))));

      if (this.adaptiveLightingSupported()) {
        const controller = new this.platform.AdaptiveLightingController(this.service);
        this.accessory.configureController(controller);
      }
    } else {
      this.service.removeCharacteristic(this.service.getCharacteristic(C.ColorTemperature));
    }

    if (this.bulb.hasColour) {
      this.service.getCharacteristic(C.Hue).onSet(this.wrapSet((v) => this.bulb.setHue(Number(v))));
      this.service
        .getCharacteristic(C.Saturation)
        .onSet(this.wrapSet((v) => this.bulb.setSaturation(Number(v))));
    } else {
      this.service.removeCharacteristic(this.service.getCharacteristic(C.Hue));
      this.service.removeCharacteristic(this.service.getCharacteristic(C.Saturation));
    }
  }

  /** Wrap a setter so it resets the poll clock and logs/handles failures. */
  private wrapSet(fn: (value: CharacteristicValue) => Promise<void>) {
    return async (value: CharacteristicValue): Promise<void> => {
      this.restartPolling();
      try {
        await fn(value);
      } catch (err) {
        this.platform.log.warn(`Set failed on ${this.bulb.name}:`, (err as Error).message);
        throw this.notRespondingError();
      }
    };
  }

  private async getOn(): Promise<CharacteristicValue> {
    if (!this.online) {
      throw this.notRespondingError();
    }
    return this.bulb.on;
  }

  protected async poll(): Promise<boolean> {
    return this.bulb.pull();
  }

  protected pushCharacteristics(): void {
    const C = this.platform.Characteristic;
    this.service.updateCharacteristic(C.On, this.bulb.on);
    this.service.updateCharacteristic(C.Brightness, this.bulb.brightness);
    if (this.bulb.hasColour) {
      this.service.updateCharacteristic(C.Hue, this.bulb.hue);
      this.service.updateCharacteristic(C.Saturation, this.bulb.saturation);
    }
    if (this.bulb.hasKelvin) {
      this.service.updateCharacteristic(C.ColorTemperature, this.bulb.colorTemperature);
    }
  }

  private adaptiveLightingSupported(): boolean {
    return Boolean(
      this.platform.api.versionGreaterOrEqual?.('v1.3.0-beta.23'),
    );
  }
}
