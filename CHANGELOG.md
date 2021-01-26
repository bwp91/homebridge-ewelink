# Change Log

All notable changes to this homebridge-ewelink will be documented in this file.

## BETA

## New

* **[Experimental]** Expose a TH10/16 device as a fully working thermostat accessory
* **[Experimental]** Use a switch to control the `Obstruction Detected` feature of a garage door

### Changes

* Fix for TH10/16 devices when the HomeKit switch would show the state of 'auto' mode
* Fix for the display of watts/amps/volts for outlets that support this

## 4.4.5 (2021-01-24)

### Changes

* Fix where the battery for DW2 device would not update

## 4.4.4 (2021-01-24)

### Changes

* Backend - better handling of errors

## 4.4.3 (2021-01-20)

### Changes

* Fixes an issue where RF sensors would not use a custom defined type

## 4.4.2 (2021-01-20)

### Changes

* Fixes an issue when adding new RF bridge devices
* Minimum Homebridge beta needed for Adaptive Lighting bumped to beta-46

## 4.4.1 (2021-01-20)

### Changes

* Fakegato logging disabled in Homebridge `debug` mode, can be explicitly enabled with `debugFakegato`

## 4.4.0 (2021-01-14)

### ⚠️ Breaking Changes

* **Accessory Simulations** - if use the following:
  * 1 Lock
  * 1 Tap/Faucet
  * 1 Valve
* you will need to update your configuration with the Device Setup field (via Homebridge UI) or adding the line `"setup": "oneSwitch"` directly to your configuration file in the groups section

### New

* Single Accessory Simulations for multi-channel devices (e.g. 1 valve using a Sonoff 4CH)
* `operationTime` for Accessory Simulations will now be validated and increased to 20 if less than 20 or an invalid number

### Changes

* Changes to plugin now in CHANGELOG.md
* Removed `Obstruction Detected` tests

## 4.3.0 (2021-01-12)

### ⚠️ Breaking Changes

* `hideDevFromHB` config option renamed to `ignoredDevices`
  * After installing this update any hidden devices may reappear in Homebridge. Please edit your configuration directly, changing `hideDevFromHB` to `ignoredDevices`. The devices will be removed upon Homebridge restart.

### New

* New Accessory Simulations:
  * 2 Taps/Faucets using a multi-channel device
  * 4 Irrigation Valves using a multi-channel device #182 
* New `disableDeviceLogging` config option to hide device state logging #183 

### Changes

* Minimum `operationTime` for associated Accessory Simulations increased to 20 (2 seconds)
* Removal of maximum values on plugin settings screen for all `number` types
* Changes to startup log messages
* Adaptive lighting minimum Homebridge beta version is now beta-42
* Backend code changes
* Updated dependencies
