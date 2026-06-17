import type { PlatformConfig } from 'homebridge';

/** A LIFX HSBK colour tuple. Hue 0-360, saturation/brightness 0-100, kelvin in K. */
export interface Hsbk {
  hue: number;
  saturation: number;
  brightness: number;
  kelvin: number;
}

/** Full reported state of a bulb. */
export interface LightState {
  color: Hsbk;
  power: number;
  label: string;
}

export interface FirmwareVersion {
  majorVersion: number;
  minorVersion: number;
}

/** Capability flags resolved from the LIFX product database + firmware upgrades. */
export interface DeviceFeatures {
  color: boolean;
  temperatureRange?: [number, number];
  hasRelays: boolean;
}

export interface HardwareInfo {
  productId: number;
  vendorName: string;
  productName: string;
  features: DeviceFeatures;
}

/** A user-pinned device by name/address/serial. */
export interface DeviceRef {
  name?: string;
  address?: string;
  id?: string;
}

/**
 * Strongly-typed view of this plugin's Homebridge configuration block.
 * Everything is optional because Homebridge validates against config.schema.json,
 * not against this interface; defaults are applied centrally in {@link resolveConfig}.
 */
export interface LifxPluginConfig extends PlatformConfig {
  duration?: number;
  brightnessDuration?: number;
  colorDuration?: number;
  bindAddress?: string;
  broadcast?: string;
  lightOfflineTolerance?: number;
  messageHandlerTimeout?: number;
  resendPacketDelay?: number;
  resendMaxTimes?: number;
  pollIntervalMs?: number;
  pollJitterMs?: number;
  exposeFirmware?: boolean;
  debug?: boolean;
  autoDiscover?: boolean;
  removeStaleAccessories?: boolean;
  staleAccessoryDelaySeconds?: number;
  multizoneSegments?: number;
  bulbs?: DeviceRef[];
  switches?: DeviceRef[];
  excludes?: DeviceRef[];
}

/** Config after defaults have been applied. No optional fields remain. */
export interface ResolvedConfig {
  duration: number;
  brightnessDuration: number;
  colorDuration: number;
  bindAddress: string;
  broadcast: string;
  lightOfflineTolerance: number;
  messageHandlerTimeout: number;
  resendPacketDelay: number;
  resendMaxTimes: number;
  pollIntervalMs: number;
  pollJitterMs: number;
  exposeFirmware: boolean;
  debug: boolean;
  autoDiscover: boolean;
  removeStaleAccessories: boolean;
  staleAccessoryDelaySeconds: number;
  multizoneSegments: number;
  bulbs: DeviceRef[];
  switches: DeviceRef[];
  excludes: DeviceRef[];
}

const num = (v: unknown, fallback: number): number =>
  typeof v === 'number' && Number.isFinite(v) ? v : fallback;

const bool = (v: unknown, fallback: boolean): boolean =>
  typeof v === 'boolean' ? v : fallback;

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/** Centralised, single-source-of-truth default application. */
export function resolveConfig(c: LifxPluginConfig): ResolvedConfig {
  return {
    duration: num(c.duration, 0),
    brightnessDuration: num(c.brightnessDuration, 300),
    colorDuration: num(c.colorDuration, 300),
    bindAddress: typeof c.bindAddress === 'string' ? c.bindAddress : '0.0.0.0',
    broadcast: typeof c.broadcast === 'string' ? c.broadcast : '255.255.255.255',
    lightOfflineTolerance: num(c.lightOfflineTolerance, 3),
    messageHandlerTimeout: num(c.messageHandlerTimeout, 45000),
    resendPacketDelay: num(c.resendPacketDelay, 150),
    resendMaxTimes: num(c.resendMaxTimes, 3),
    pollIntervalMs: num(c.pollIntervalMs, 5000),
    pollJitterMs: num(c.pollJitterMs, 1500),
    exposeFirmware: bool(c.exposeFirmware, true),
    debug: bool(c.debug, false),
    autoDiscover: bool(c.autoDiscover, true),
    removeStaleAccessories: bool(c.removeStaleAccessories, false),
    staleAccessoryDelaySeconds: num(c.staleAccessoryDelaySeconds, 30),
    multizoneSegments: num(c.multizoneSegments, 8),
    bulbs: arr<DeviceRef>(c.bulbs),
    switches: arr<DeviceRef>(c.switches),
    excludes: arr<DeviceRef>(c.excludes),
  };
}
