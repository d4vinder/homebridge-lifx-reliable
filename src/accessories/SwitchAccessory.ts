import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { LifxHomebridgePlatform } from '../platform';
import { RelayDevice } from '../devices/RelayDevice';
import { BaseAccessory } from './BaseAccessory';

export class SwitchAccessory extends BaseAccessory {
  private readonly service: Service;

  constructor(
    platform: LifxHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly relay: RelayDevice,
    private readonly index: number,
    lightId: string,
    private readonly label: string,
  ) {
    super(platform, accessory, lightId);

    this.service =
      accessory.getService(platform.Service.Switch) ??
      accessory.addService(platform.Service.Switch);

    this.service
      .getCharacteristic(platform.Characteristic.On)
      .onGet(this.getOn.bind(this));

    void this.relay
      .init((err) => this.platform.log.warn(`Switch ${this.label} init warning:`, err.message))
      .then((reachable) => {
        this.applyHardware();
        this.applyFirmware();
        this.bindCharacteristics();
        this.goLive(reachable);
      });
  }

  protected primaryService(): Service {
    return this.service;
  }

  protected displayName(): string {
    return this.label;
  }

  private applyHardware(): void {
    this.accessory
      .getService(this.platform.Service.AccessoryInformation)!
      .setCharacteristic(this.platform.Characteristic.Manufacturer, this.relay.vendor)
      .setCharacteristic(this.platform.Characteristic.Model, this.relay.product)
      .setCharacteristic(this.platform.Characteristic.SerialNumber, this.relay.serialNumber);
  }

  private applyFirmware(): void {
    if (this.relay.version !== '0.0' && this.platform.settings.exposeFirmware) {
      const info = this.accessory.getService(this.platform.Service.AccessoryInformation)!;
      info.setCharacteristic(this.platform.Characteristic.FirmwareRevision, this.relay.version);
    }
    this.service.setCharacteristic(this.platform.Characteristic.Name, this.label);
  }

  private bindCharacteristics(): void {
    this.service
      .getCharacteristic(this.platform.Characteristic.On)
      .onGet(this.getOn.bind(this))
      .onSet(async (value: CharacteristicValue) => {
        this.restartPolling();
        try {
          await this.relay.setOn(this.index, Boolean(value));
        } catch (err) {
          this.platform.log.warn(`Set failed on ${this.label}:`, (err as Error).message);
          throw this.notRespondingError();
        }
      });
  }

  private async getOn(): Promise<CharacteristicValue> {
    if (!this.online) {
      throw this.notRespondingError();
    }
    return this.relay.isOn(this.index);
  }

  protected async poll(): Promise<boolean> {
    return this.relay.pull(this.index);
  }

  protected pushCharacteristics(): void {
    this.service.updateCharacteristic(
      this.platform.Characteristic.On,
      this.relay.isOn(this.index),
    );
  }
}
