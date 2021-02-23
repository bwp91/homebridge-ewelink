# Change Log

All notable changes to this homebridge-ewelink will be documented in this file.

## BETA

* ⚠️ This release includes an overhaul of the configuration with some breaking changes - [more info](https://gist.github.com/bwp91/e87d9d3eb0e5dbc08e9ae7b31e33366e)

### Added

* **Configuration**
  * The ability to explicitly enable device logging per device if you have `disableDeviceLogging` set to true
  * A `label` setting per device group which has no effect except to help identify the device when editing the configuration
  * New `brightnessStep` option to specify a minimum brightness step in the Home app per dimmer/bulb/LED strip
  * New `adaptiveLightingShift` option to offset the Adaptive Lighting values per bulb
  * `showAsOutlet` option extended multi-channel switch and light switch devices to expose them as outlets
* **Accessories**
  * Enhanced Eve information available for contact sensors:
    * DW2
    * Zigbee Contact Sensor
* **Accessory Simulations**
  * Expose a DW2 contact sensor as a leak sensor
  * Sub-accessories will be removed automatically when setting up a new Accessory Simulation
* **Homebridge Plugin UI**
  * 'My Devices' shows a red/green icon on the to show device WAN/LAN reachability
  * 'My Devices' shows the firmware version for your device
* **New Devices**
  * Support for eWeLink switch uiid 81, 82, 83, 84 and 107 device types
  * Support for the 'Sonoff Hum' humidifier device (on/off and mode)

### Changes

* New plugin configuration format - [more info](https://gist.github.com/bwp91/e87d9d3eb0e5dbc08e9ae7b31e33366e)
* Device firmware version will now show correctly in HomeKit apps
* Fixes a characteristic warning for *MotionDetected* for Zigbee Motion Sensors
* Information about error 406 added to the logs in the form of a link (shown when error is received)
* Updated minimum Node to v14.16.0

## 4.7.6 (2021-02-17)

### Changes

* Fixes an issue with the DW2 detecting garage door states

## 4.7.5 (2021-02-15)

### Changes

* Fixes an issue with the DW2 detecting garage door states

## 4.7.4 (2021-02-15)

### Changes

* Fixes an issue when using custom RF sensors

## 4.7.3 (2021-02-13)

### Changes

* Hide WS messages that have no useful information about a device
* Thermostat accessory simulation will now setup after a small delay to let the accessory initialise first
* Thermostat device will now suggest changing temperature scale from F to C in the eWeLink app
* Changes to colour conversion:
  * Lighter colours appear brighter
  * Solid red is now easier to obtain via the Home app

## 4.7.2 (2021-02-12)

### Changes

* Fixes a bug where config items separated by a comma weren't adhered to properly
* Stop subsequent warning messages if a device fails to initialise

## 4.7.1 (2021-02-11)

### Changes

* The 'auto' and 'cool' modes will now be hidden for thermostat devices in the Eve app
* Fixed a bug when initialising lock accessory simulations
* Added a 10 second timeout when sending web socket messages
* Updated dependencies:
  * `websocket-as-promised` to v2.0.1
* Fakegato library formatting and simplification

## 4.7.0 (2021-02-10)

### Added

* Support for the [eWeLink thermostat](https://ewelinkcommunity.net/device-lists/heating/kkmoon-hc-t010-ewf/) device type
* A queue for device updates to improve reliability, this also results in:
  * Faster device updates for colour bulbs and diffusers
* Configuration checks to highlight in the logs any unnecessary or incorrectly formatted settings you have
* Added a note in the plugin UI when adding an Accessory Simulation that the accessory will need to be removed from the cache
* Links to 'Configuration' and 'Uninstall' wiki pages in the plugin-ui

### Changes

* ⚠️ `ignoredDevices` configuration option is now an array not a string - [see details](https://gist.github.com/bwp91/90db67d578a8206c5a98a3447839f9e5)
* ⚠️ Removed `nameOverride` configuration option - the plugin can now obtain channel names from eWeLink
* ⚠️ Removed `resetRFBridge` option - the same usage can be achieved with `ignoredDevices`
* Reinstated `ipOverride` into the Homebridge plugin UI screen
* Improved colour temperature conversion for L1 and L1 Lite devices
* Fixed a bug where Adaptive Lighting would not be disabled if the colour was changed from the eWeLink app
* Fixed an issue with the 'Lock' Accessory Simulation where the status would never update as 'Unlocked'
* HTTP error codes will be displayed in the logs if and when the plugin re-attempts the connection
* Error messages refactored to show the most useful information
* [Backend] Major code refactoring
* [Backend] Code comments
* Updated minimum Node to v14.15.5
* Updated minimum Homebridge to v1.1.7
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
