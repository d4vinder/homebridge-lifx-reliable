# homebridge-lifx-reliable

A resilient Homebridge bridge for LIFX LAN bulbs and switches.

This is an independent, ground-up TypeScript implementation. Its design was
**inspired by** [`homebridge-lifx-plugin`](https://github.com/calvarium/homebridge-lifx-plugin)
(Apache-2.0); see `NOTICE` and the *Attribution* section below.

## Why this exists

The goal is reliability under real LAN conditions — flaky Wi-Fi, dropped UDP,
and bulbs that occasionally go quiet — without the bridge flapping, bursting the
network, or crashing on one odd device.

## Architecture

```
HomeKit
   │  characteristics (onGet/onSet)
   ▼
accessories/      LightAccessory · SwitchAccessory
   │              └── BaseAccessory: jittered polling + hysteresis offline detection
   ▼
devices/          Light · RelayDevice   (async state model, feature resolution)
   │
   ▼
protocol/         LifxTransport (interface)
   │              └── LanClientTransport  ← swappable: drop in a native LAN protocol here
   ▼
LIFX bulbs (UDP)
```

The entire stack above `protocol/transport.ts` depends only on the
`LifxTransport` interface. The default transport wraps `lifx-lan-client`, but a
dependency-free native protocol can be substituted by implementing that one
interface — no changes to the accessory or device layers.

## Changes from the original (Apache-2.0 §4(b))

- **Async/await throughout.** The original's nested-callback `Init()` flow is
  replaced by promisified device methods with hard per-call timeouts.
- **Strict TypeScript.** `strict`, `noImplicitAny`, `noUnusedLocals`,
  `noImplicitReturns` all on; no `lodash` dependency.
- **Transport abstraction.** Network code is isolated behind `LifxTransport`.
- **Jittered polling.** Each device polls at `interval + random(jitter)` instead
  of a synchronised `setInterval`, avoiding LAN bursts across a fleet.
- **Hysteresis offline detection.** A device is marked *Not Responding* only
  after N *consecutive* failed polls, not a single miss.
- **Consolidated accessory logic.** Offline/online/polling lives once in
  `BaseAccessory` rather than being duplicated across bulb and switch files.
- **Bug fix.** The original `switch.ts` invoked its error fallback without
  `return`, then called the success callback with an undefined value; the
  reimplemented relay path cannot do this.
- **Centralised config defaults** in `resolveConfig`.

## Multizone strips

A multizone strip (LIFX Z / Beam) is exposed as several independent HomeKit
colour lights — one per contiguous range of zones — so sections can be set
separately. The number of segments is configurable via `multizoneSegments`
(default 4); zones are divided into equal segments. Reducing the count (or
disabling the extras below) removes the corresponding tiles on the next restart.

- **Move** (`multizoneMoveEffect`, on by default) — the firmware scrolling
  animation, exposed as a single on/off switch. Its speed (`multizoneMoveSpeed`,
  1–100) and direction (`multizoneMoveDirection`, TOWARDS/AWAY) live in the
  config rather than as HomeKit controls, to keep it to one tile.
- **Themes** (`multizoneThemes`, off by default) — optional momentary switches
  (Rainbow, Sunset, Ocean, Forest, Fire) that paint a palette across the strip.
  Tidier alternative: build a Home **scene** from the segment lights (and the
  Move switch) — it lives in Home's Scenes, not as tiles, and can be used in
  automations.

## Install

```bash
npm install -g homebridge-lifx-reliable
```

Add the `LifxReliable` platform via the Homebridge UI, or in `config.json`:

```json
{
  "platforms": [
    { "platform": "LifxReliable", "name": "LIFX Reliable", "autoDiscover": true }
  ]
}
```

## Develop

```bash
npm install
npm run build       # tsc -> dist/
npm run typecheck   # tsc --noEmit (strict, passes clean)
npm run lint
```

## Attribution

Inspired by `homebridge-lifx-plugin` by calvarium (Apache-2.0). Depends on
`lifx-lan-client` (MIT). See `NOTICE`.
