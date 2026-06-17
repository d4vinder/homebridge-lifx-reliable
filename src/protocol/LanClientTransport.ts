import { EventEmitter } from 'events';
import Lifx from 'lifx-lan-client';

import type { FirmwareVersion, Hsbk, LightState } from '../types';
import type {
  LifxTransport,
  TransportDevice,
  TransportEvents,
  TransportOptions,
} from './transport';

/** Minimal shape of a `lifx-lan-client` light object (the library ships no types). */
interface RawLight {
  id: string;
  address: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [method: string]: any;
}

/**
 * Wrap a node-style `(err, value) => void` callback method in a promise with a
 * hard timeout, so a silently-dropped UDP reply can never wedge an accessory.
 */
function callbackToPromise<T>(
  invoke: (cb: (err: Error | null, value: T) => void) => void,
  timeoutMs: number,
  label: string,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      reject(new Error(`LIFX ${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    invoke((err, value) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (err) {
        reject(err);
      } else {
        resolve(value);
      }
    });
  });
}

class LanClientDevice implements TransportDevice {
  constructor(
    private readonly light: RawLight,
    private readonly timeoutMs: number,
  ) {}

  get id(): string {
    return this.light.id;
  }

  get address(): string {
    return this.light.address;
  }

  getState(): Promise<LightState> {
    return callbackToPromise<LightState>(
      (cb) => this.light.getState(cb),
      this.timeoutMs,
      'getState',
    );
  }

  getFirmware(): Promise<FirmwareVersion> {
    return callbackToPromise<FirmwareVersion>(
      (cb) => this.light.getFirmwareVersion(cb),
      this.timeoutMs,
      'getFirmwareVersion',
    );
  }

  getHardware(): Promise<unknown> {
    return callbackToPromise<unknown>(
      (cb) => this.light.getHardwareVersion(cb),
      this.timeoutMs,
      'getHardwareVersion',
    );
  }

  getLabel(): Promise<string> {
    return callbackToPromise<string>(
      (cb) => this.light.getLabel(cb),
      this.timeoutMs,
      'getLabel',
    );
  }

  hasRelays(): Promise<boolean> {
    // `hasRelays` in the library takes a single value-only callback.
    return new Promise<boolean>((resolve) => {
      try {
        this.light.hasRelays((value: boolean) => resolve(Boolean(value)));
      } catch {
        resolve(false);
      }
    });
  }

  async setColor(color: Hsbk, durationMs: number): Promise<void> {
    this.light.color(
      color.hue,
      color.saturation,
      color.brightness,
      color.kelvin,
      durationMs,
    );
  }

  async setPower(on: boolean, durationMs: number): Promise<void> {
    if (on) {
      this.light.on(durationMs);
    } else {
      this.light.off(durationMs);
    }
  }

  getRelayPower(index: number): Promise<number> {
    return callbackToPromise<number>(
      (cb) => this.light.getRelayPower(index, cb),
      this.timeoutMs,
      'getRelayPower',
    );
  }

  async setRelayPower(index: number, on: boolean): Promise<void> {
    if (on) {
      this.light.relayOn(index);
    } else {
      this.light.relayOff(index);
    }
  }

  isMultizone(): Promise<boolean> {
    // Mirrors how the library detects relays: read the product's feature flags
    // from the hardware/version response.
    return callbackToPromise<{ productFeatures?: { multizone?: boolean } }>(
      (cb) => this.light.getHardwareVersion(cb),
      this.timeoutMs,
      'getHardwareVersion',
    )
      .then((hw) => Boolean(hw?.productFeatures?.multizone))
      .catch(() => false);
  }

  getZoneCount(): Promise<number> {
    // A single-zone query returns the strip's total zone count.
    return callbackToPromise<{ count: number }>(
      (cb) => this.light.getColorZones(0, 0, cb),
      this.timeoutMs,
      'getColorZones',
    ).then((r) => r.count);
  }

  getZoneColor(index: number): Promise<Hsbk> {
    return callbackToPromise<{ color: Hsbk }>(
      (cb) => this.light.getColorZones(index, index, cb),
      this.timeoutMs,
      'getColorZones',
    ).then((r) => r.color);
  }

  async setZoneColors(
    startIndex: number,
    endIndex: number,
    color: Hsbk,
    durationMs: number,
  ): Promise<void> {
    this.light.colorZones(
      startIndex,
      endIndex,
      color.hue,
      color.saturation,
      color.brightness,
      color.kelvin,
      durationMs,
      true,
    );
  }
}

/**
 * Default transport, layered over `lifx-lan-client`. Isolated here so the rest
 * of the plugin depends only on {@link LifxTransport} and can be re-pointed at a
 * native protocol implementation later.
 */
export class LanClientTransport extends EventEmitter implements LifxTransport {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly client: any = new Lifx.Client();
  private timeoutMs = 45000;
  private readonly devices = new Map<string, LanClientDevice>();

  on<E extends keyof TransportEvents>(event: E, listener: TransportEvents[E]): this {
    return super.on(event, listener) as this;
  }

  start(options: TransportOptions): void {
    this.timeoutMs = options.messageHandlerTimeout;

    this.client.on('light-new', (light: RawLight) => {
      const device = new LanClientDevice(light, this.timeoutMs);
      this.devices.set(light.id, device);
      this.emit('device-added', device);
    });

    this.client.on('light-online', (light: RawLight) => {
      const device = this.devices.get(light.id);
      if (device) {
        this.emit('device-online', device);
      }
    });

    this.client.on('light-offline', (light: RawLight) => {
      const device = this.devices.get(light.id);
      if (device) {
        this.emit('device-offline', device);
      }
    });

    try {
      this.client.init({
        address: options.bindAddress,
        broadcast: options.broadcast,
        lightOfflineTolerance: options.lightOfflineTolerance,
        messageHandlerTimeout: options.messageHandlerTimeout,
        resendPacketDelay: options.resendPacketDelay,
        resendMaxTimes: options.resendMaxTimes,
        debug: options.debug,
        lights: options.lights,
      });
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    }
  }

  stop(): void {
    try {
      this.client.destroy?.();
    } catch {
      // best effort
    }
    // `lifx-lan-client`'s destroy() closes the socket but leaves `isSocketBound`
    // true and can leave per-queue send timers running. Those timers then call
    // socket.send() on the closed socket and throw "Error: Not running" on every
    // Homebridge restart. Force the cleanup the library omits — this adapter is
    // the right (and only) place that may touch the library's internals.
    try {
      this.client.isSocketBound = false;
      const timers = this.client.sendTimers;
      if (timers) {
        for (const key of Object.keys(timers)) {
          clearInterval(timers[key]);
          delete timers[key];
        }
      }
    } catch {
      // best effort
    }
  }
}
