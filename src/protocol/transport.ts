import type { FirmwareVersion, Hsbk, LightState } from '../types';

/**
 * A single physical LIFX device as exposed by a transport.
 *
 * This is a deliberately thin, fully-promisified surface. The default
 * implementation wraps `lifx-lan-client`, but anything satisfying this
 * interface can be dropped in — including a native, dependency-free LAN
 * protocol implementation — without touching the accessory/platform layers.
 */
export interface TransportDevice {
  readonly id: string;
  readonly address: string;

  getState(): Promise<LightState>;
  getFirmware(): Promise<FirmwareVersion>;
  /** Raw hardware payload from the device; shape is transport-specific. */
  getHardware(): Promise<unknown>;
  getLabel(): Promise<string>;

  /** Returns true if the device exposes relays (i.e. it is a LIFX switch). */
  hasRelays(): Promise<boolean>;

  setColor(color: Hsbk, durationMs: number): Promise<void>;
  setPower(on: boolean, durationMs: number): Promise<void>;

  getRelayPower(index: number): Promise<number>;
  setRelayPower(index: number, on: boolean): Promise<void>;

  /** Returns true if the device is a multizone strip (LIFX Z / Beam). */
  isMultizone(): Promise<boolean>;
  /** Total number of addressable zones on a multizone strip. */
  getZoneCount(): Promise<number>;
  /** Colour of a single zone (used as the representative colour for a segment). */
  getZoneColor(index: number): Promise<Hsbk>;
  /** Set an inclusive zone range [startIndex, endIndex] to one colour. */
  setZoneColors(startIndex: number, endIndex: number, color: Hsbk, durationMs: number): Promise<void>;
  /** Start or stop the firmware "Move" animation on a multizone strip. */
  setMoveEffect(on: boolean, speedMs: number, direction: 'TOWARDS' | 'AWAY'): Promise<void>;
}

export interface TransportEvents {
  'device-added': (device: TransportDevice) => void;
  'device-online': (device: TransportDevice) => void;
  'device-offline': (device: TransportDevice) => void;
  error: (err: Error) => void;
}

export interface TransportOptions {
  bindAddress: string;
  broadcast: string;
  lightOfflineTolerance: number;
  messageHandlerTimeout: number;
  resendPacketDelay: number;
  resendMaxTimes: number;
  debug: boolean;
  /** Statically-known device addresses to seed discovery with. */
  lights: string[];
}

/** Network transport that discovers and manages LIFX devices. */
export interface LifxTransport {
  on<E extends keyof TransportEvents>(event: E, listener: TransportEvents[E]): void;
  start(options: TransportOptions): void;
  stop(): void;
}
