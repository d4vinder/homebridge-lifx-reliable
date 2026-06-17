import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { LifxHomebridgePlatform } from '../platform';
import { MultizoneStrip, type MoveDirection } from '../devices/Strip';

/**
 * The firmware "Move" animation as a plain on/off switch. Speed and direction
 * are read from the plugin config rather than exposed as HomeKit controls, to
 * keep the strip to a single extra tile. The strip can't report effect state
 * back, so the switch reflects the last value set here.
 */
export class MoveSwitchAccessory {
  private readonly service: Service;
  private active = false;

  constructor(
    private readonly platform: LifxHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly strip: MultizoneStrip,
    name: string,
    private readonly speedPct: number,
    private readonly direction: MoveDirection,
  ) {
    const C = platform.Characteristic;
    this.service =
      accessory.getService(platform.Service.Switch) ?? accessory.addService(platform.Service.Switch);
    this.service.setCharacteristic(C.Name, name);

    this.service
      .getCharacteristic(C.On)
      .onGet(() => this.active)
      .onSet(async (value: CharacteristicValue) => {
        this.active = Boolean(value);
        try {
          await this.strip.setMove(this.active, this.speedPct, this.direction);
        } catch (err) {
          this.platform.log.warn('Move effect set failed:', (err as Error).message);
          throw new this.platform.api.hap.HapStatusError(
            this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
          );
        }
      });
  }
}
