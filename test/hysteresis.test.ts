import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { BaseAccessory } from '../src/accessories/BaseAccessory';
import type { LifxHomebridgePlatform } from '../src/platform';
import type { PlatformAccessory, Service } from 'homebridge';

interface Settings {
  pollIntervalMs: number;
  pollJitterMs: number;
  lightOfflineTolerance: number;
}

/** Minimal concrete accessory exposing reachability + online state for the test. */
class TestAccessory extends BaseAccessory {
  reachable = true;
  pushed = 0;

  constructor(platform: LifxHomebridgePlatform) {
    super(platform, {} as PlatformAccessory, 'test-id');
  }

  protected primaryService(): Service {
    return (this.platform as unknown as { __service: Service }).__service;
  }

  protected async poll(): Promise<boolean> {
    return this.reachable;
  }

  protected pushCharacteristics(): void {
    this.pushed += 1;
  }

  protected displayName(): string {
    return 'Test';
  }

  get isOnline(): boolean {
    return this.online;
  }

  begin(reachable: boolean): void {
    this.goLive(reachable);
  }
}

function makePlatform(settings: Settings): LifxHomebridgePlatform {
  const onChar = { updateValue: vi.fn() };
  const service = { getCharacteristic: () => onChar };
  class HapStatusError extends Error {
    constructor(public readonly status: number) {
      super('hap');
    }
  }
  return {
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
    settings,
    Characteristic: { On: 'On' },
    api: { hap: { HapStatusError, HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402 } } },
    __service: service,
  } as unknown as LifxHomebridgePlatform;
}

describe('BaseAccessory hysteresis & polling', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('marks offline only after N consecutive misses, never on the first', async () => {
    const acc = new TestAccessory(
      makePlatform({ pollIntervalMs: 1000, pollJitterMs: 0, lightOfflineTolerance: 3 }),
    );
    acc.begin(true);
    expect(acc.isOnline).toBe(true);

    acc.reachable = false;
    await vi.advanceTimersByTimeAsync(1000); // miss 1
    expect(acc.isOnline).toBe(true);
    await vi.advanceTimersByTimeAsync(1000); // miss 2
    expect(acc.isOnline).toBe(true);
    await vi.advanceTimersByTimeAsync(1000); // miss 3 -> offline
    expect(acc.isOnline).toBe(false);
  });

  it('resets the miss counter after a single successful poll', async () => {
    const acc = new TestAccessory(
      makePlatform({ pollIntervalMs: 1000, pollJitterMs: 0, lightOfflineTolerance: 3 }),
    );
    acc.begin(true);

    acc.reachable = false;
    await vi.advanceTimersByTimeAsync(1000); // miss 1
    await vi.advanceTimersByTimeAsync(1000); // miss 2

    acc.reachable = true;
    await vi.advanceTimersByTimeAsync(1000); // success -> counter resets
    expect(acc.isOnline).toBe(true);
    expect(acc.pushed).toBeGreaterThan(0);

    acc.reachable = false;
    await vi.advanceTimersByTimeAsync(1000); // miss 1 (again)
    await vi.advanceTimersByTimeAsync(1000); // miss 2
    expect(acc.isOnline).toBe(true); // still online: the counter had reset
  });

  it('recovers via an external online signal after going offline', async () => {
    const acc = new TestAccessory(
      makePlatform({ pollIntervalMs: 1000, pollJitterMs: 0, lightOfflineTolerance: 2 }),
    );
    acc.begin(true);

    acc.reachable = false;
    await vi.advanceTimersByTimeAsync(1000); // miss 1
    await vi.advanceTimersByTimeAsync(1000); // miss 2 -> offline
    expect(acc.isOnline).toBe(false);

    acc.reachable = true;
    acc.setOnline(); // transport reports the device back
    expect(acc.isOnline).toBe(true);
  });
});
