import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { LifxHomebridgePlatform } from '../platform';
import { MultizoneStrip, type MoveDirection } from '../devices/Strip';

/**
 * The firmware "Move" animation exposed as a Fan: Active = on/off, RotationSpeed
 * = animation speed, RotationDirection = TOWARDS / AWAY. The strip has no way to
 * report effect state back, so intended state is held locally.
 */
export class MoveEffectAccessory {
  private readonly service: Service;
  private active = false;
  private speedPct = 50;
  private direction: MoveDirection = 'TOWARDS';

  constructor(
    private readonly platform: LifxHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly strip: MultizoneStrip,
    name: string,
  ) {
    const C = platform.Characteristic;
    this.service =
      accessory.getService(platform.Service.Fanv2) ?? accessory.addService(platform.Service.Fanv2);
    this.service.setCharacteristic(C.Name, name);

    this.service
      .getCharacteristic(C.Active)
      .onGet(() => (this.active ? 1 : 0))
      .onSet(
        this.wrap(async (v) => {
          this.active = Number(v) === 1;
          await this.apply();
        }),
      );

    this.service
      .getCharacteristic(C.RotationSpeed)
      .onGet(() => this.speedPct)
      .onSet(
        this.wrap(async (v) => {
          this.speedPct = Math.max(0, Math.min(100, Number(v)));
          this.active = this.speedPct > 0;
          await this.apply();
        }),
      );

    this.service
      .getCharacteristic(C.RotationDirection)
      .onGet(() => (this.direction === 'TOWARDS' ? 0 : 1))
      .onSet(
        this.wrap(async (v) => {
          this.direction = Number(v) === 0 ? 'TOWARDS' : 'AWAY';
          if (this.active) {
            await this.apply();
          }
        }),
      );
  }

  private async apply(): Promise<void> {
    const speed = this.speedPct > 0 ? this.speedPct : 50;
    await this.strip.setMove(this.active, speed, this.direction);
  }

  private wrap(fn: (value: CharacteristicValue) => Promise<void>) {
    return async (value: CharacteristicValue): Promise<void> => {
      try {
        await fn(value);
      } catch (err) {
        this.platform.log.warn('Move effect set failed:', (err as Error).message);
        throw new this.platform.api.hap.HapStatusError(
          this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
        );
      }
    };
  }
}
