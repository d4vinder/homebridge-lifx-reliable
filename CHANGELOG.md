# Changelog

All notable changes to this project are documented here. The format is loosely
based on [Keep a Changelog](https://keepachangelog.com/), and this project
adheres to [Semantic Versioning](https://semver.org/).

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
