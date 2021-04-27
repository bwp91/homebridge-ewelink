# Change Log

All notable changes to this homebridge-ewelink will be documented in this file.

## BETA

### Changes

* Increase ws timeout from 5 to 6 seconds

## 6.2.2 (2021-04-27)

### Changes

* Adjust iFan speed thresholds (now 0% is off, 1-33% is low, 34-66% is medium and 67-100% is high)
* Changed commands for multi-channel devices to only update desired channel (not all channels)
* Pause Adaptive Lighting if device is offline
* Automatically retry eWeLink login on startup in case of certain error codes
* Update package description (remove 'with original firmware' as this is redundant for eWeLink devices)

## 6.2.1 (2021-04-18)

### Changes

* Trim new lines and spaces from password when decoded from base64
* Updated dependencies (`ws`)

## 6.2.0 (2021-04-16)

### Added

* LAN mode for Sonoff RF Bridge

### Changes

* Fix characteristic NaN warning for `LastActivation`
* More compact logging for eWeLink 504 error
* Remove online/offline status for Zigbee sensor devices
* Recover accessories from the cache using the UUID
* Reduce WS timeout to 5 seconds to reduce cases of `was slow to respond` HB warning
* Update wiki links in the Homebridge plugin-ui

## 6.1.2 (2021-04-14)

### Changes

* Remove any existing humidity sensor for TH10/16 if DS18B20 sensor is used

## 6.1.1 (2021-04-13)

### Changes

* Fixed an unhandled rejection error when controlling certain CCT bulbs

## 6.1.0 (2021-04-12)

### Added

* Support for doorbell model SA-026 (can be exposed as any sensor type as per other RF sensors)
* Updated plugin-ui 'Support' page links to match GitHub readme file

### Changes

* Improvements to RF Bridge:
  * No more characteristic warnings for `LastActivation` for motion and contact sensors
  * Removed logs for 'not triggered' if device has since been triggered again
* Fixed the interval time length for calculating total energy consumption for relevant devices

## 6.0.3 (2021-04-08)

### Changes

* [fix] Revert 'No Response' messages for **DW2** devices as they go on and offline

## 6.0.2 (2021-04-07)

### Changes

* Revert 'No Response' messages for **DW2** devices as they go on and offline

## 6.0.1 (2021-04-07)

### Requirements

* **Homebridge Users**
  * This plugin has a minimum requirement of Homebridge v1.3.3

* **HOOBS Users**
  * This plugin has a minimum requirement of HOOBS v3.3.4

### Changes

* 'No Response' messages for **Zigbee and DW2** devices as they go on and offline
* 'No Response' messages for  **all devices** if controlled and unsuccessful (and this status will be reverted after 5 seconds)
* Use the new `.onGet`/`.onSet` methods available in Homebridge v1.3
* Fixes a caching issue with the iFan accessory
* Updated README to reflect minimum supported Homebridge/HOOBS and Node versions
* Updated recommended Node to v14.16.1
  
## 5.6.0 (2021-03-25)

### Added

* Enter your eWeLink password as a base64 encoded string and use the option `encodedPassword` to let the plugin know ([#223](https://github.com/bwp91/homebridge-ewelink/issues/223))
* Support for zigbee colour temperature lights (ewelink uiid 1258) ([#222](https://github.com/bwp91/homebridge-ewelink/issues/222)), including:
  * Ikea Tradfri E14 600 lumen

### Changes

* Improvements to web socket connection: ([#224](https://github.com/bwp91/homebridge-ewelink/issues/224))
  * On startup, the plugin will wait to connect to the web socket before initialising devices
  * A new web socket address will be requested if the provided address causes errors
  * In particular this should fix the `ENOTFOUND as-pconnect4.coolkit.cc` error that some users in the Asia continent were receiving

## 5.5.1 (2021-03-21)

### Changes

* Remove the custom `minValue` for `CurrentTemperature` characteristic
* More welcome messages
* Updated `plugin-ui-utils` dependency

## 5.5.0 (2021-03-17)

### Added

* Enable LAN control for the Sonoff SV
* Log entries will show for 'uncontrollable' devices if `mode:lan` on plugin startup
* Log entries to highlight unnecessary top-level configuration options you may have set
* Added a note in the plugin settings about changing RF bridge sensors and its consequences

### Changes

* Remove country code configuration option as the plugin can determine your region automatically
* Modified config schema to show titles/descriptions for non Homebridge UI users
* Automatically show useful info in logs for 'yet to implement' devices
* Updated links on plugin-ui to match GitHub wiki
* [backend] Eve characteristics abstracted into separate file for better efficiency

## 5.4.0 (2021-03-14)

### Added

* The plugin now differentiates between LAN support for **incoming** and **outgoing** updates, allowing incoming updates for:
  * TH10/16
  * B02 and B05 bulbs

### Changes

* Attempt to fix outlet polling updates so the device reports updated info rather than the previous info.

## 5.3.0 (2021-03-10)

### Added

* Set up a polling interval for outlet devices to obtain power information on a regular basis (useful when the device doesn't automatically send frequent updates)

### Changes

* Adaptive Lighting now requires Homebridge 1.3 release
* Garages no longer need 'dummy' contact sensor to view Eve history
  * For this reason, the `exposeContactSensor` setting is now redundant and so has been removed
* Outlet intervals for energy calculation and updates will stop on Homebridge shutdown

## 5.2.0 (2021-03-08)

### Added

* **Accessory Simulations**
  * Expose an optional contact sensor for Eachen garage devices for historical data in the Eve app
  * Set custom minimum/maximum target temperatures for the TH10/16 thermostat simulation

### Changes

* Specify a custom IP for the Sonoff D1
* Show full error stack on plugin disable in debug mode
* Fixes a `multiple callback` error with CCT bulb accessories
* Updated dependencies

## 5.1.1 (2021-03-02)

### Changes

* Fixes an issue sending LAN updates to multi-channel devices

## 5.1.0 (2021-03-02)

### Added

* **Accessory Simulations**
  * Added `Door` service type simulation
  * Added `Window` service type simulation
  * [experimental] Specify different operation time for UP and DOWN for garages, blinds, doors and windows
* **Accessories**
  * Support for Sonoff DUALR3
  * Support for Konesky Mosquito Killer
  * Support for Sonoff SC (Sensor Centre)
  * [experimental] Support for Sonoff D1 LAN control

### Changes

* Less strict threshold for determining a 'significant' colour change for disabling Adaptive Lighting

## 5.0.6 (2021-02-26)

### Changes

* Removes the extra *Switch* service that was accidentally added to certain bulbs

## 5.0.5 (2021-02-25)

### Changes

* Reverse the polarity of the leak sensor simulation
  * You can expose a DW2 sensor as a leak sensor using [this guide](https://www.youtube.com/watch?v=YFu2LZfrrqs) as an Accessory Simulation

## 5.0.4 (2021-02-24)

### Changes

* Plugin will check that certain Accessory Simulations have been setup with the device type
* Hide IP address field in plugin settings if plugin `mode` is set to `wan`

## 5.0.3 (2021-02-24)

### Changes

* Remove old *Switch* services when setting up Accessory Simulations
* Add the type of Accessory Simulation to the logged options on restart

## 5.0.2 (2021-02-24)

### Changes

* Fixes an issue initialising Accessory Simulation Lock devices

## 5.0.1 (2021-02-24)

### Changes

* Fixes an issue initialising Contact Sensor devices

## 5.0.0 (2021-02-24)

* ⚠️ This release includes an overhaul of the settings in particular to specific device configuration
* The following options have been replaced:
  * `hideChanFromHB`, `switchAsOutlet`, `outletAsSwitch`, `inUsePowerThreshold`, `hideLightFromFan`, `hideSwitchFromTH`, `thAsThermostat`, `resetRFBridge`, `lowBattThreshold`, `sensorTimeDifference`, `bulbB02BA60`, `bulbB02FST64`, `thTempOffset`, `hideZBLDPress`, `ZBDWBatt`, `ipOverride`
* If you use any of the above options then please take some time to review the changes after updating the plugin
* Detailed information about the changes can be seen [here](https://gist.github.com/bwp91/e87d9d3eb0e5dbc08e9ae7b31e33366e)


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
