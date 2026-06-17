import type {
  API,
  AdaptiveLightingController,
  Characteristic,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  Service,
} from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { resolveConfig, type DeviceRef, type LifxPluginConfig, type ResolvedConfig } from './types';
import { LanClientTransport } from './protocol/LanClientTransport';
import type { LifxTransport, TransportDevice } from './protocol/transport';
import { Light } from './devices/Light';
import { RelayDevice } from './devices/RelayDevice';
import { LightAccessory } from './accessories/LightAccessory';
import { SwitchAccessory } from './accessories/SwitchAccessory';
import { BaseAccessory } from './accessories/BaseAccessory';

export class LifxHomebridgePlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly AdaptiveLightingController: typeof AdaptiveLightingController =
    this.api.hap.AdaptiveLightingController;

  public readonly settings: ResolvedConfig;

  private readonly transport: LifxTransport;
  private readonly cached: PlatformAccessory[] = [];
  private readonly active = new Map<string, BaseAccessory[]>();

  constructor(
    public readonly log: Logger,
    config: LifxPluginConfig,
    public readonly api: API,
    transport?: LifxTransport,
  ) {
    this.settings = resolveConfig(config);
    this.transport = transport ?? new LanClientTransport();

    this.log.debug('Initialised platform:', config.name);

    this.api.on('didFinishLaunching', () => this.discover());
    this.api.on('shutdown', () => this.transport.stop());
  }

  /** Homebridge re-hydrates previously-registered accessories through here. */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.debug('Loading accessory from cache:', accessory.displayName);
    this.cached.push(accessory);
  }

  private discover(): void {
    this.transport.on('error', (err) => this.log.error('Transport error:', err.message));

    this.transport.on('device-added', (device) => this.onDeviceAdded(device));

    this.transport.on('device-online', (device) =>
      this.forEachAccessory(device.id, (a) => a.setOnline()),
    );
    this.transport.on('device-offline', (device) =>
      this.forEachAccessory(device.id, (a) => a.setOffline()),
    );

    const broadcast = this.settings.autoDiscover ? this.settings.broadcast : '0.0.0.0';
    const seedLights = [
      ...this.settings.bulbs.map((b) => b.address),
      ...this.settings.switches.map((s) => s.address),
    ].filter((a): a is string => typeof a === 'string' && a.length > 0);

    this.transport.start({
      bindAddress: this.settings.bindAddress,
      broadcast,
      lightOfflineTolerance: this.settings.lightOfflineTolerance,
      messageHandlerTimeout: this.settings.messageHandlerTimeout,
      resendPacketDelay: this.settings.resendPacketDelay,
      resendMaxTimes: this.settings.resendMaxTimes,
      debug: this.settings.debug,
      lights: seedLights,
    });
  }

  private async onDeviceAdded(device: TransportDevice): Promise<void> {
    if (this.isExcluded(device)) {
      this.removeByUuid(this.uuid(device.id));
      this.log.info('Excluded device removed:', device.id);
      return;
    }

    let label = device.address || 'LIFX Bulb';
    try {
      label = (await device.getLabel()) || label;
    } catch {
      // fall back to address
    }

    let hasRelays = false;
    try {
      hasRelays = await device.hasRelays();
    } catch {
      hasRelays = false;
    }

    if (hasRelays) {
      for (let i = 0; i < 4; i++) {
        this.attachSwitch(device, `${label} ${i + 1}`, i);
      }
    } else {
      this.attachLight(device, label);
    }
  }

  private isExcluded(device: TransportDevice): boolean {
    return this.settings.excludes.some(
      (e: DeviceRef) => e.id === device.id || e.address === device.address,
    );
  }

  // ---- UUID helpers -------------------------------------------------------

  private uuid(id: string): string {
    return this.api.hap.uuid.generate(id);
  }

  private relayUuid(id: string, index: number): string {
    return this.api.hap.uuid.generate(index + id);
  }

  private findCached(uuid: string): PlatformAccessory | undefined {
    return this.cached.find((a) => a.UUID === uuid);
  }

  private removeByUuid(uuid: string): void {
    const accessory = this.findCached(uuid);
    if (accessory) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    }
  }

  private register(uuid: string, name: string): PlatformAccessory {
    const accessory = new this.api.platformAccessory(name, uuid);
    this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    this.cached.push(accessory);
    return accessory;
  }

  // ---- attach -------------------------------------------------------------

  private attachLight(device: TransportDevice, name: string): void {
    const uuid = this.uuid(device.id);
    const accessory = this.findCached(uuid) ?? this.register(uuid, name);

    const bulb = new Light(device, {
      power: this.settings.duration,
      brightness: this.settings.brightnessDuration,
      colour: this.settings.colorDuration,
    });

    this.track(device.id, new LightAccessory(this, accessory, bulb, device.id));
  }

  private attachSwitch(device: TransportDevice, name: string, index: number): void {
    const uuid = this.relayUuid(device.id, index);
    const accessory = this.findCached(uuid) ?? this.register(uuid, name);

    const relay = new RelayDevice(device, name);
    this.track(device.id, new SwitchAccessory(this, accessory, relay, index, device.id, name));
  }

  private track(id: string, accessory: BaseAccessory): void {
    const list = this.active.get(id) ?? [];
    list.push(accessory);
    this.active.set(id, list);
  }

  private forEachAccessory(id: string, fn: (a: BaseAccessory) => void): void {
    this.active.get(id)?.forEach(fn);
  }
}
