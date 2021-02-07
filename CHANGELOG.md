# Change Log

All notable changes to this homebridge-ewelink will be documented in this file.

## BETA

### Added

* A queue for device updates to improve reliability
* Configuration checks to highlight any unnecessary or incorrectly formatted settings you have
* Link to 'Configuration' wiki page in the plugin-ui
* Added a note in the plugin UI when adding an Accessory Simulation that the accessory will need to be removed from the cache

### Changes

* ⚠️ Removed `nameOverride` configuration option
* Reinstated `ipOverride` into the Homebridge plugin UI screen
* Fixed an issue with the 'Lock' Accessory Simulation where the status would never update as 'Unlocked'
* Colour conversation formula changes
* HTTP error codes will be displayed in the logs if and when the plugin re-attempts the connection
* Error messages refactored to show the most useful information
* [Backend] Major code refactoring
* [Backend] Code comments
* Updated dependencies

## 4.6.1 (2021-02-02)

### Changes

* Extra debug logging for WS reconnection status
* Updated `ws` dependency to v7.4.3

## 4.6.0 (2021-01-30)

### New

* **[Experimental]** Use a TH10/16 device as a thermostat using an Accessory Simulation [more info](https://github.com/bwp91/homebridge-ewelink/issues/161#issuecomment-770230157)
* Support for the Zigbee type white bulb

### Changes

* Updated plugin-ui-utils dep and use new method to get cached accessories
* Increase the timeout for LAN control to 10 seconds for LAN only settings
* Show LAN update errors in the log

## 4.5.1 (2021-01-28)

### Changes

* Set the switch as the primary service of a TH10/16 device
* Only show the line in error logs if it exists (no more `[line undefined]`)
* Fixes an issue where RF sensors would not use a custom defined type (again!)

## 4.5.0 (2021-01-28)

### New

* Use a switch to control the `Obstruction Detected` feature of a garage door

### Changes

* Fix for TH10/16 devices when the HomeKit switch would show the state of 'auto' mode
* Fix for TH10/16 devices (shown as thermostat) where the plugin would not show the current state of the device
* Fix for the display of watts/amps/volts for outlets that support this
* More consistent and clearer error logging

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
