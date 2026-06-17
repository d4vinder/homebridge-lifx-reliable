import type { CharacteristicValue, PlatformAccessory, Service } from 'homebridge';

import type { LifxHomebridgePlatform } from '../platform';
import type { MultizoneStrip } from '../devices/Strip';
import type { StripTheme } from '../protocol/themes';

/**
 * A momentary switch that paints a theme palette across the strip. It flips
 * itself back off shortly after, behaving like a "paint this gradient" button.
 */
export class ThemeAccessory {
  private readonly service: Service;

  constructor(
    private readonly platform: LifxHomebridgePlatform,
    accessory: PlatformAccessory,
    private readonly strip: MultizoneStrip,
    private readonly theme: StripTheme,
    private readonly fadeMs: number,
  ) {
    const C = platform.Characteristic;
    this.service =
      accessory.getService(platform.Service.Switch) ?? accessory.addService(platform.Service.Switch);
    this.service.setCharacteristic(C.Name, theme.name);

    this.service
      .getCharacteristic(C.On)
      .onGet(() => false)
      .onSet((value: CharacteristicValue) => this.onSet(value));
  }

  private onSet(value: CharacteristicValue): void {
    if (!value) {
      return;
    }
    void this.strip
      .applyTheme(this.theme.stops, this.fadeMs)
      .catch((err) =>
        this.platform.log.warn(`Theme "${this.theme.name}" failed:`, (err as Error).message),
      );
    // Momentary: reset to off so the switch reads as a button.
    setTimeout(
      () => this.service.updateCharacteristic(this.platform.Characteristic.On, false),
      800,
    );
  }
}
