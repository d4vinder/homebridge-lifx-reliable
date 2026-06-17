import type { PlatformAccessory, Service } from 'homebridge';

import type { LifxHomebridgePlatform } from '../platform';

/**
 * Shared reachability + polling behaviour for every accessory type.
 *
 * Improvements over a naive `setInterval` poller:
 *  - **Jitter:** each poll is scheduled at `interval + random(jitter)` so a
 *    fleet of bulbs does not broadcast in lockstep and saturate the LAN.
 *  - **Hysteresis:** a device is only marked "Not Responding" after
 *    `offlineTolerance` *consecutive* failed polls, so a single dropped UDP
 *    reply no longer flaps the accessory.
 *  - **Self-rescheduling timeout** rather than a fixed interval, so a slow poll
 *    can never overlap the next one.
 */
export abstract class BaseAccessory {
  protected online = false;
  private timer?: NodeJS.Timeout;
  private consecutiveMisses = 0;

  protected constructor(
    protected readonly platform: LifxHomebridgePlatform,
    public readonly accessory: PlatformAccessory,
    public readonly lightId: string,
  ) {}

  /** Concrete accessories implement the On characteristic + service lookup. */
  protected abstract primaryService(): Service;
  /** Refresh device state from the network. Returns reachability. */
  protected abstract poll(): Promise<boolean>;
  /** Push freshly-pulled state onto HomeKit characteristics. */
  protected abstract pushCharacteristics(): void;
  /** Human-readable name for logging. */
  protected abstract displayName(): string;

  protected get onCharacteristic() {
    return this.primaryService().getCharacteristic(this.platform.Characteristic.On);
  }

  /** Throw this from any onGet handler while the device is unreachable. */
  protected notRespondingError(): Error {
    return new this.platform.api.hap.HapStatusError(
      this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE,
    );
  }

  protected markOnline(): void {
    if (this.online) {
      return;
    }
    this.online = true;
    this.consecutiveMisses = 0;
    this.platform.log.info('Device online:', this.displayName());
    this.restartPolling();
  }

  protected markOffline(): void {
    if (!this.online) {
      return;
    }
    this.online = false;
    this.stopPolling();
    // HAP event notifications carry values, not error codes, so the only way to
    // surface "Not Responding" is to set the cached status code; HomeKit picks
    // it up on its next poll (Home app open, Siri, automation).
    this.onCharacteristic.updateValue(this.notRespondingError());
    this.platform.log.info('Device offline:', this.displayName());
  }

  /** Call after a successful Init to begin the poll loop. */
  protected goLive(reachable: boolean): void {
    if (reachable) {
      this.online = true;
      this.restartPolling();
    } else {
      this.online = false;
      this.onCharacteristic.updateValue(this.notRespondingError());
      this.platform.log.info('Device unreachable at startup:', this.displayName());
    }
  }

  /** External online/offline signals from the transport. */
  setOnline(): void {
    this.markOnline();
  }

  setOffline(): void {
    this.markOffline();
  }

  /** Reset the poll clock, e.g. immediately after a user-initiated set. */
  protected restartPolling(): void {
    this.stopPolling();
    this.scheduleNext();
  }

  private stopPolling(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private scheduleNext(): void {
    const { pollIntervalMs, pollJitterMs } = this.platform.settings;
    const delay = pollIntervalMs + Math.random() * pollJitterMs;
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  private async tick(): Promise<void> {
    let reachable = false;
    try {
      reachable = await this.poll();
    } catch {
      reachable = false;
    }

    if (reachable) {
      this.consecutiveMisses = 0;
      if (this.online) {
        this.pushCharacteristics();
      } else {
        this.markOnline();
      }
    } else {
      this.consecutiveMisses += 1;
      if (this.consecutiveMisses >= this.platform.settings.lightOfflineTolerance) {
        this.markOffline();
      }
    }

    if (this.online || this.consecutiveMisses < this.platform.settings.lightOfflineTolerance) {
      this.scheduleNext();
    }
  }
}
