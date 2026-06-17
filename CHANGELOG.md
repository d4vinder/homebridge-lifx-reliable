# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), and this project
adheres to [Semantic Versioning](https://semver.org/).

## [1.5.0]

### Changed
- Decluttered multizone strips. Default segment count is now **4** (was 8). The
  Move effect is now a single on/off **switch** instead of a Fan; its speed and
  direction moved to config (`multizoneMoveSpeed`, `multizoneMoveDirection`).
  Theme switches are now **off by default** — building Home scenes from the
  segments is the tidier path.
- Reducing strip configuration (fewer segments, disabling Move/themes) now
  removes the corresponding accessories on restart instead of leaving them
  stranded.

## [1.4.0]

### Added
- **Multizone "Move" animation** exposed as a Fan: Active = on/off, the speed
  slider = animation speed, fan direction = TOWARDS / AWAY (`multizoneMoveEffect`,
  default on).
- **Preset gradient themes** (Rainbow, Sunset, Ocean, Forest, Fire) as momentary
  switches that paint a strip; pair with Move for animated themes
  (`multizoneThemes`, default on). Starting Move or applying a theme powers the
  strip on first.

## [1.3.1]

### Fixed
- Multizone segments did nothing when the strip's master power was off: turning
  a segment on (or raising its brightness) now powers the strip on, and a
  segment reports "on" only when the strip is powered *and* its zones are bright.

## [1.3.0]

### Added
- **Multizone support (LIFX Z / Beam).** A multizone strip is split into a
  configurable number of independently-controllable HomeKit colour lights
  (`multizoneSegments`, default 8), each mapped to a contiguous zone range via
  `setColorZones`. On upgrade, a strip's pre-existing single-light accessory is
  replaced by its segments.

## [1.2.0]

### Added
- `switches` array is now editable in the Homebridge config UI (it was defined
  in the schema but missing from the layout).
- `removeStaleAccessories` (default off) and `staleAccessoryDelaySeconds`
  (default 30) options. After discovery settles, cached accessories whose device
  never reappeared are logged; with removal enabled they are unregistered.

### Changed
- LIFX labels are trimmed of stray leading/trailing whitespace before they
  become HomeKit accessory names.

### Fixed
- Duplicate `device-added` events (e.g. a transport reconnect) no longer
  double-register or double-poll an accessory.

## [1.1.0]

### Fixed
- Colour temperature now renders native white via the LIFX kelvin channel with
  zero saturation, instead of a saturated black-body RGB approximation that
  tinted warm temperatures orange. Adaptive Lighting benefits too.

### Added
- Discovery and accessory lifecycle logging (discovery start, each discovered
  bulb/switch with label and address, added vs. restored).
- A vitest test suite (colour, config, product resolution, light behaviour, and
  the hysteresis offline/recovery loop), run in CI and on prepublish.

## [1.0.0]

- Initial release: resilient Homebridge bridge for LIFX LAN bulbs and switches
  with jittered polling, hysteresis offline detection, and a swappable transport.
