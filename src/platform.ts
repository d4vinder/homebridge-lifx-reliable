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
import { StripSegment } from './devices/Strip';
import { LightAccessory } from './accessories/LightAccessory';
import { SwitchAccessory } from './accessories/SwitchAccessory';
import { SegmentAccessory } from './accessories/SegmentAccessory';
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
  /** UUIDs of accessories matched to a live device this session. */
  private readonly claimed = new Set<string>();
  private staleTimer?: NodeJS.Timeout;

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
    this.api.on('shutdown', () => {
      if (this.staleTimer) {
        clearTimeout(this.staleTimer);
      }
      this.transport.stop();
    });
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

    this.log.info(
      'Starting LIFX discovery (auto-discover %s%s)…',
      this.settings.autoDiscover ? 'on' : 'off',
      seedLights.length ? `, ${seedLights.length} seeded` : '',
    );

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

    // After discovery has had time to settle, report (and optionally remove)
    // cached accessories whose device never reappeared — e.g. a bulb that was
    // permanently taken off the network.
    const delayMs = Math.max(1, this.settings.staleAccessoryDelaySeconds) * 1000;
    this.staleTimer = setTimeout(() => this.sweepStaleAccessories(), delayMs);
  }

  /**
   * Cached accessories not claimed by a live device after the settle window are
   * "stale". They are always logged; they are only unregistered when the user
   * opts in via `removeStaleAccessories`, since removing an accessory also drops
   * its HomeKit room assignment, automations and scenes.
   */
  private sweepStaleAccessories(): void {
    const stale = this.cached.filter((a) => !this.claimed.has(a.UUID));
    if (stale.length === 0) {
      return;
    }
    for (const accessory of stale) {
      if (this.settings.removeStaleAccessories) {
        this.log.info('Removing stale accessory:', accessory.displayName);
        this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      } else {
        this.log.warn(
          'Accessory "%s" was not rediscovered; enable removeStaleAccessories to prune it.',
          accessory.displayName,
        );
      }
    }
  }

  private async onDeviceAdded(device: TransportDevice): Promise<void> {
    if (this.isExcluded(device)) {
      this.removeByUuid(this.uuid(device.id));
      this.log.info('Excluded device removed:', device.id);
      return;
    }

    // Guard against a device being added twice (e.g. transport reconnect): the
    // first add already created and is polling its accessories.
    if (this.active.has(device.id)) {
      this.log.debug('Ignoring duplicate discovery for', device.id);
      return;
    }

    let label = device.address || 'LIFX Bulb';
    try {
      // Labels set in the LIFX app often carry stray leading/trailing spaces;
      // trim so HomeKit accessory names are clean.
      const fetched = (await device.getLabel())?.trim();
      if (fetched) {
        label = fetched;
      }
    } catch {
      // fall back to address
    }

    let hasRelays = false;
    try {
      hasRelays = await device.hasRelays();
    } catch {
      hasRelays = false;
    }

    let multizone = false;
    if (!hasRelays) {
      try {
        multizone = await device.isMultizone();
      } catch {
        multizone = false;
      }
    }

    const kind = hasRelays ? 'switch' : multizone ? 'strip' : 'bulb';
    this.log.info('Discovered %s "%s" at %s', kind, label, device.address || device.id);

    if (hasRelays) {
      for (let i = 0; i < 4; i++) {
        this.attachSwitch(device, `${label} ${i + 1}`, i);
      }
    } else if (multizone) {
      await this.attachStrip(device, label);
    } else {
      this.attachLight(device, label);
    }
  }

  /** Split a multizone strip into independently-controllable segment lights. */
  private async attachStrip(device: TransportDevice, label: string): Promise<void> {
    // Replace any legacy single-light accessory for this strip from before
    // multizone support existed.
    this.removeByUuid(this.uuid(device.id));

    let zoneCount = 0;
    try {
      zoneCount = await device.getZoneCount();
    } catch {
      zoneCount = 0;
    }
    if (zoneCount <= 0) {
      this.log.warn('Strip "%s" reported no zones; exposing it as a single light.', label);
      this.attachLight(device, label);
      return;
    }

    const segments = Math.max(1, Math.min(this.settings.multizoneSegments, zoneCount));
    this.log.info('Strip "%s": %d zones → %d segments', label, zoneCount, segments);

    for (let i = 0; i < segments; i++) {
      const start = Math.floor((i * zoneCount) / segments);
      const end = Math.floor(((i + 1) * zoneCount) / segments) - 1;
      this.attachSegment(device, `${label} ${i + 1}`, start, end, i);
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
    const index = this.cached.findIndex((a) => a.UUID === uuid);
    if (index !== -1) {
      this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.cached[index]]);
      this.cached.splice(index, 1);
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
    const cached = this.findCached(uuid);
    const accessory = cached ?? this.register(uuid, name);
    this.claimed.add(uuid);
    this.log.info('%s bulb accessory: %s', cached ? 'Restored' : 'Added', name);

    const bulb = new Light(device, {
      power: this.settings.duration,
      brightness: this.settings.brightnessDuration,
      colour: this.settings.colorDuration,
    });

    this.track(device.id, new LightAccessory(this, accessory, bulb, device.id));
  }

  private attachSwitch(device: TransportDevice, name: string, index: number): void {
    const uuid = this.relayUuid(device.id, index);
    const cached = this.findCached(uuid);
    const accessory = cached ?? this.register(uuid, name);
    this.claimed.add(uuid);
    this.log.info('%s switch accessory: %s', cached ? 'Restored' : 'Added', name);

    const relay = new RelayDevice(device, name);
    this.track(device.id, new SwitchAccessory(this, accessory, relay, index, device.id, name));
  }

  private attachSegment(
    device: TransportDevice,
    name: string,
    startIndex: number,
    endIndex: number,
    index: number,
  ): void {
    const uuid = this.api.hap.uuid.generate(`zone${index}:${device.id}`);
    const cached = this.findCached(uuid);
    const accessory = cached ?? this.register(uuid, name);
    this.claimed.add(uuid);
    this.log.info(
      '%s strip segment: %s (zones %d–%d)',
      cached ? 'Restored' : 'Added',
      name,
      startIndex,
      endIndex,
    );

    const segment = new StripSegment(device, name, startIndex, endIndex, {
      power: this.settings.duration,
      brightness: this.settings.brightnessDuration,
      colour: this.settings.colorDuration,
    });
    this.track(device.id, new SegmentAccessory(this, accessory, segment, device.id));
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
