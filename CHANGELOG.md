# Change Log

All notable changes to this homebridge-ewelink will be documented in this file.

## BETA

### Added

- **LAN Mode (without eWeLink credentials)**
  - The plugin now supports removing eWeLink credentials from the config when in LAN mode
  - It is important to read about this feature before enabling it - [read more](https://github.com/bwp91/homebridge-ewelink/wiki/Connection-Methods#lan-mode-without-ewelink-credentials)
- **Accessory Logging**
  - `overrideLogging` setting per device type (to replace the removed `overrideDisabledLogging`), which can be set to (and will override the global device logging and debug logging settings):
    - `"default"` to follow the global device update and debug logging setting for this accessory (default if setting not set)
    - `"standard"` to enable device update logging but disable debug logging for this accessory
    - `"debug"` to enable device update and debug logging for this accessory
    - `"disable"` to disable device update and debug logging for this accessory
- **Startup Logging**
  - An accessory warning if a manually configured IP is different from the discovered IP
  - An accessory warning if a shared device is used over the cloud
  - An accessory warning if a cloud-device is reported offline
- **No Response Status**
  - Added a global setting `offlineAsNoResponse` to mark cloud-offline accessories as 'No Response' in HomeKit
- **Single/Multi-Channel Devices**
  - Wattage/Voltage/Amp readings (via Eve app) now visible for outlets in Eve app when exposed as `Switch`
  - Wattage/Voltage/Amp readings (via Eve app) now visible for DUALR3 when in motor mode
  - Support for LAN mode control for DUALR3 in motor mode
  - Polling via LAN mode to enable constant power attribute updates for POWR2 devices
- **iFan Devices**
  - Support for LAN mode control
  - Added option to specify a manual IP
- **TH10/16 Devices**
  - Implemented polling as firmware 3.5.0 does not seem to send regular temperature updates
  - Implemented LAN mode for Accessory Simulations (eWeLink 'auto' mode is no longer used)
  - Added option to specify a manual IP
- **RF Bridge Devices**
  - Ability to change sensor type and other configurable options without the need to re-add the accessory
  - Configuration option `resetOnStartup` to reset the subdevices, useful when adding/removing subdevices to the bridge
  - Added option to specify a manual IP for an RF Bridge
- **Zigbee Button Device**
  - Comparison of trigger time against notification time to reduce duplicate accessory updates
  - Will no longer request current state when coming back online to reduce duplicate accessory updates
- **Humidity Sensor Devices**
  - Config option to offset the recorded humidity (%RH) for devices that report this
- **Garage Simulations**
  - Added `TimesOpened` Eve characteristic functionality to single garage door simulation
- **Lock Simulations**
  - Added the option of using a DW2 or Zigbee contact sensor to determine _Locked_ and _Unlocked_ state
- **New Devices**
  - Support for Zigbee leak sensors
  - Support for device with eWeLink UIID 67 _RollingDoor_

### Changed

- **LAN Mode**
  - ⚠️ If you have the plugin in `lan`-only mode then the plugin will remove any accessories that do not support LAN mode
- **Startup Logging**
  - Accessory configuration options will be logged regardless of logging level
- **iFan Devices**
  - Previous fan speed will be used again after turning off and on
- **POWR2/DUALR3 Devices**
  - Polling for power/temperature/humidity readings increased to two minutes
  - Polling for data will be skipped if device is marked as offline
- **TH10/16 Devices**
  - Polling for data will be skipped if device is marked as offline
- **Configuration**
  - `sensorTimeDifference` minimum reduced to 5 seconds and default reduced to 60 seconds
- **Dependencies**
  - Recommended node version bump to v14.17.1
  - Bump `ws` dependency to v7.5.1

### Fixed

- An issue preventing controlling a garage door simulation when using a sensor

### Removed

- `overrideDisabledLogging` setting for each accessory type
- `ContactSensorState` and other unneeded characteristics from garage (simulation) services

## 6.8.0 (2021-06-14)

### Added

- **Accessory Simulations**
  - Expose a single/multi channel device as any type of sensor
  - Expose a single/multi channel device an _Air Purifier_
  - Expose a TH10/16 device as a _Cooler_
  - Expose a TH10/16 device as a _Humidifier_
  - Expose a TH10/16 device as a _Dehumidfier_
- **LAN Mode**
  - Enabled for TH10/16 (requires firmware 3.5.0)
- **Plugin UI**
  - Show MAC address of accessory in plugin-ui

### Changed

- TH10/16 simulation accessory type change from _Thermostat_ to _Heater_

### Removed

- Remove `setup` config option for simulations as device type is now automatically determined

### Fixed

- Fix a logging issue for the zigbee contact sensor

## 6.7.1 (2021-05-27)

### Fixed

- Fixes an issue with sensors with a garage simulation
- Fixes an issue with TH10/16 devices with web socket timeouts

## 6.7.0 (2021-05-26)

### Added

- Hide a contact sensor from HomeKit when used with a garage door simulation
- Support devices with eWeLink UIID 112, 113, 114

### Changed

- Avoid repeated battery logging for the Sonoff DW2
- iFan logging modifications
- Throw an error when controlling a device when the web socket is closed (avoid queuing updates)
- Recommended node version bump to v14.17.0
- Bump `ws` dependency to v7.4.6
- Use `standard-prettier` code formatting

### Fixed

- Fix internal API auth issue when using a base64 encoded password

## 6.6.0 (2021-05-10)

### Added

- Log internal API requests when in debug mode
- Support querying temperature and humidity values via the internal API

### Changed

- Display temperature and humidity units for the zigbee temperature/humidity sensor in the logs
- Reduce the 'No Response' timeout to 2 seconds
- Update the correct corresponding characteristic after the 'No Response' timeout
- Ensure user is using at least Homebridge v1.3.0
- Update homebridge-ui wiki links to match github readme file

### Removed

- Removed `encodedPassword` and `language` config options
  - The plugin will now initially try the supplied password and if incorrect will attempt another login with a base64 decoded version
- Language option unnecessary until if and when other languages are available

### Fixed

- Fixes an issue where the web socket would not close on plugin shutdown

## 6.5.1 (2021-05-07)

### Changed

- Amendments to internal API endpoints
- Device IP changes will now reflect correctly

### Fixed

- Fixes an initialisation issue with the 'garage' and 'obstruction detection' switch simulations

## 6.5.0 (2021-05-06)

### Added

- Internal HTTP API to query/control the state of certain homebridge-ewelink accessories
  - Options for new configuration setting `apiPort` are:
    - `0` to disable the API (default setting)
    - `1` to enable the API with a random available port (port will be shown in the log)
    - Any higher integer to enable the API on this fixed port
  - Documentation for the API can be seen at the base url (Homebridge IP + API port)

## 6.4.0 (2021-05-04)

### Added

- Power, voltage and current readings for DUALR3 when exposed as outlets
- RF Bridge remote buttons will turn on for 3 seconds in HomeKit when pressed
- Link a Zigbee contact sensor to a single garage door to report the garage door state
- Set a temperature offset for the Zigbee temperature/humidity sensor
- Configuration options to manually set account http host and country code [#249](https://github.com/bwp91/homebridge-ewelink/pull/249)

### Changed

- Change Sonoff POWR2/S31 polling interval to a fixed 60 seconds
- iFan speed will now log as {low, medium, high}
- Remove 'Outlet In Use' characteristics for outlets that don't support power readings
- Remove Eve power characteristics for outlets that don't support power readings
- More language strings added to separate language file
- Accessory 'identify' function will now add an entry to the log
- Backend refactoring, function and variable name changes

## 6.3.0 (2021-04-28)

### Added

- Support DUALR3 motor mode (as a _WindowCovering_ service)

### Changed

- Remove old _Switch_ services from DUALR3 when in motor mode
- iFan devices now use caching to avoid unnecessary duplicate updates
- Increase ws timeout from 5 to 6 seconds
- Decrease lan-only timeout from 10 to 9 seconds

## 6.2.2 (2021-04-27)

### Changed

- Adjust iFan speed thresholds (now 0% is off, 1-33% is low, 34-66% is medium and 67-100% is high)
- Changed commands for multi-channel devices to only update desired channel (not all channels)
- Pause Adaptive Lighting if device is offline
- Automatically retry eWeLink login on startup in case of certain error codes
- Update package description (remove 'with original firmware' as this is redundant for eWeLink devices)

## 6.2.1 (2021-04-18)

### Changed

- Trim new lines and spaces from password when decoded from base64
- Updated dependencies (`ws`)

## 6.2.0 (2021-04-16)

### Added

- LAN mode for Sonoff RF Bridge

### Changed

- More compact logging for eWeLink 504 error
- Recover accessories from the cache using the UUID
- Reduce WS timeout to 5 seconds to reduce cases of `was slow to respond` HB warning
- Update wiki links in the Homebridge plugin-ui

### Removed

- Remove online/offline status for Zigbee sensor devices

### Fixed

- Fix characteristic NaN warning for `LastActivation`

## 6.1.2 (2021-04-14)

### Fixed

- Remove any existing humidity sensor for TH10/16 if DS18B20 sensor is used

## 6.1.1 (2021-04-13)

### Fixed

- Fixed an unhandled rejection error when controlling certain CCT bulbs

## 6.1.0 (2021-04-12)

### Added

- Support for doorbell model SA-026 (can be exposed as any sensor type as per other RF sensors)
- Updated plugin-ui 'Support' page links to match GitHub readme file

### Changed

- Improvements to RF Bridge:
  - No more characteristic warnings for `LastActivation` for motion and contact sensors
  - Removed logs for 'not triggered' if device has since been triggered again

## 6.0.3 (2021-04-08)

### Fixed

- Revert 'No Response' messages for **DW2** devices as they go on and offline
- Fixed the interval time length for calculating total energy consumption for relevant devices

## 6.0.2 (2021-04-07)

### Changed

- Revert 'No Response' messages for **DW2** devices as they go on and offline

## 6.0.1 (2021-04-07)

### Requirements

- **Homebridge Users**

  - This plugin has a minimum requirement of Homebridge v1.3.3

- **HOOBS Users**
  - This plugin has a minimum requirement of HOOBS v3.3.4

### Changed

- 'No Response' messages for **Zigbee and DW2** devices as they go on and offline
- 'No Response' messages for **all devices** if controlled and unsuccessful (and this status will be reverted after 5 seconds)
- Use the new `.onGet`/`.onSet` methods available in Homebridge v1.3
- Updated README to reflect minimum supported Homebridge/HOOBS and Node versions
- Updated recommended Node to v14.16.1

### Fixed

- Fixes a caching issue with the iFan accessory

## 5.6.0 (2021-03-25)

### Added

- Enter your eWeLink password as a base64 encoded string and use the option `encodedPassword` to let the plugin know ([#223](https://github.com/bwp91/homebridge-ewelink/issues/223))
- Support for zigbee colour temperature lights (ewelink uiid 1258) ([#222](https://github.com/bwp91/homebridge-ewelink/issues/222)), including:
  - Ikea Tradfri E14 600 lumen

### Changed

- Improvements to web socket connection: ([#224](https://github.com/bwp91/homebridge-ewelink/issues/224))
  - On startup, the plugin will wait to connect to the web socket before initialising devices
  - A new web socket address will be requested if the provided address causes errors
  - In particular this should fix the `ENOTFOUND as-pconnect4.coolkit.cc` error that some users in the Asia continent were receiving

## 5.5.1 (2021-03-21)

### Changed

- Remove the custom `minValue` for `CurrentTemperature` characteristic
- More welcome messages
- Updated `plugin-ui-utils` dependency

## 5.5.0 (2021-03-17)

### Added

- Enable LAN control for the Sonoff SV
- Log entries will show for 'uncontrollable' devices if `mode:lan` on plugin startup
- Log entries to highlight unnecessary top-level configuration options you may have set
- Added a note in the plugin settings about changing RF bridge sensors and its consequences

### Changed

- Remove country code configuration option as the plugin can determine your region automatically
- Modified config schema to show titles/descriptions for non Homebridge UI users
- Automatically show useful info in logs for 'yet to implement' devices
- Updated links on plugin-ui to match GitHub wiki
- [backend] Eve characteristics abstracted into separate file for better efficiency

## 5.4.0 (2021-03-14)

### Added

- The plugin now differentiates between LAN support for **incoming** and **outgoing** updates, allowing incoming updates for:
  - TH10/16
  - B02 and B05 bulbs

### Fixed

- Attempt to fix outlet polling updates so the device reports updated info rather than the previous info.

## 5.3.0 (2021-03-10)

### Added

- Set up a polling interval for outlet devices to obtain power information on a regular basis (useful when the device doesn't automatically send frequent updates)

### Changed

- Adaptive Lighting now requires Homebridge 1.3 release
- Garages no longer need 'dummy' contact sensor to view Eve history
  - For this reason, the `exposeContactSensor` setting is now redundant and so has been removed
- Outlet intervals for energy calculation and updates will stop on Homebridge shutdown

## 5.2.0 (2021-03-08)

### Added

- **Accessory Simulations**
  - Expose an optional contact sensor for Eachen garage devices for historical data in the Eve app
  - Set custom minimum/maximum target temperatures for the TH10/16 thermostat simulation

### Changed

- Specify a custom IP for the Sonoff D1
- Show full error stack on plugin disable in debug mode
- Updated dependencies

### Fixed

- Fixes a `multiple callback` error with CCT bulb accessories

## 5.1.1 (2021-03-02)

### Fixed

- Fixes an issue sending LAN updates to multi-channel devices

## 5.1.0 (2021-03-02)

### Added

- **Accessory Simulations**
  - Added `Door` service type simulation
  - Added `Window` service type simulation
  - [experimental] Specify different operation time for UP and DOWN for garages, blinds, doors and windows
- **Accessories**
  - Support for Sonoff DUALR3
  - Support for Konesky Mosquito Killer
  - Support for Sonoff SC (Sensor Centre)
  - [experimental] Support for Sonoff D1 LAN control

### Changed

- Less strict threshold for determining a 'significant' colour change for disabling Adaptive Lighting

## 5.0.6 (2021-02-26)

### Fixed

- Removes the extra _Switch_ service that was accidentally added to certain bulbs

## 5.0.5 (2021-02-25)

### Changed

- Reverse the polarity of the leak sensor simulation
  - You can expose a DW2 sensor as a leak sensor using [this guide](https://www.youtube.com/watch?v=YFu2LZfrrqs) as an Accessory Simulation

## 5.0.4 (2021-02-24)

### Changed

- Plugin will check that certain Accessory Simulations have been setup with the device type
- Hide IP address field in plugin settings if plugin `mode` is set to `wan`

## 5.0.3 (2021-02-24)

### Changed

- Remove old _Switch_ services when setting up Accessory Simulations
- Add the type of Accessory Simulation to the logged options on restart

## 5.0.2 (2021-02-24)

### Fixed

- Fixes an issue initialising Accessory Simulation Lock devices

## 5.0.1 (2021-02-24)

### Fixed

- Fixes an issue initialising Contact Sensor devices

## 5.0.0 (2021-02-24)

- ⚠️ This release includes an overhaul of the settings in particular to specific device configuration
- The following options have been replaced:
  - `hideChanFromHB`, `switchAsOutlet`, `outletAsSwitch`, `inUsePowerThreshold`, `hideLightFromFan`, `hideSwitchFromTH`, `thAsThermostat`, `resetRFBridge`, `lowBattThreshold`, `sensorTimeDifference`, `bulbB02BA60`, `bulbB02FST64`, `thTempOffset`, `hideZBLDPress`, `ZBDWBatt`, `ipOverride`
- If you use any of the above options then please take some time to review the changes after updating the plugin
- Detailed information about the changes can be seen [here](https://gist.github.com/bwp91/e87d9d3eb0e5dbc08e9ae7b31e33366e)

### Added

- **Configuration**
  - The ability to explicitly enable device logging per device if you have `disableDeviceLogging` set to true
  - A `label` setting per device group which has no effect except to help identify the device when editing the configuration
  - New `brightnessStep` option to specify a minimum brightness step in the Home app per dimmer/bulb/LED strip
  - New `adaptiveLightingShift` option to offset the Adaptive Lighting values per bulb
  - `showAsOutlet` option extended multi-channel switch and light switch devices to expose them as outlets
- **Accessories**
  - Enhanced Eve information available for contact sensors:
    - DW2
    - Zigbee Contact Sensor
- **Accessory Simulations**
  - Expose a DW2 contact sensor as a leak sensor
  - Sub-accessories will be removed automatically when setting up a new Accessory Simulation
- **Homebridge Plugin UI**
  - 'My Devices' shows a red/green icon on the to show device WAN/LAN reachability
  - 'My Devices' shows the firmware version for your device
- **New Devices**
  - Support for eWeLink switch uiid 81, 82, 83, 84 and 107 device types
  - Support for the 'Sonoff Hum' humidifier device (on/off and mode)

### Changed

- New plugin configuration format - [more info](https://gist.github.com/bwp91/e87d9d3eb0e5dbc08e9ae7b31e33366e)
- Device firmware version will now show correctly in HomeKit apps
- Information about error 406 added to the logs in the form of a link (shown when error is received)
- Updated minimum Node to v14.16.0

### Fixed

- Fixes a characteristic warning for _MotionDetected_ for Zigbee Motion Sensors

## 4.7.6 (2021-02-17)

### Fixed

- Fixes an issue with the DW2 detecting garage door states

## 4.7.5 (2021-02-15)

### Changed

- Fixes an issue with the DW2 detecting garage door states

## 4.7.4 (2021-02-15)

### Fixed

- Fixes an issue when using custom RF sensors

## 4.7.3 (2021-02-13)

### Changed

- Hide WS messages that have no useful information about a device
- Thermostat accessory simulation will now setup after a small delay to let the accessory initialise first
- Thermostat device will now suggest changing temperature scale from F to C in the eWeLink app
- Changes to colour conversion:
  - Lighter colours appear brighter
  - Solid red is now easier to obtain via the Home app

## 4.7.2 (2021-02-12)

### Fixed

- Fixes a bug where config items separated by a comma weren't adhered to properly
- Stop subsequent warning messages if a device fails to initialise

## 4.7.1 (2021-02-11)

### Changed

- The 'auto' and 'cool' modes will now be hidden for thermostat devices in the Eve app
- Added a 10 second timeout when sending web socket messages
- Updated dependencies:
  - `websocket-as-promised` to v2.0.1
- Fakegato library formatting and simplification

### Fixed

- Fixed a bug when initialising lock accessory simulations

## 4.7.0 (2021-02-10)

### Added

- Support for the [eWeLink thermostat](https://ewelinkcommunity.net/device-lists/heating/kkmoon-hc-t010-ewf/) device type
- A queue for device updates to improve reliability, this also results in:
  - Faster device updates for colour bulbs and diffusers
- Configuration checks to highlight in the logs any unnecessary or incorrectly formatted settings you have
- Added a note in the plugin UI when adding an Accessory Simulation that the accessory will need to be removed from the cache
- Links to 'Configuration' and 'Uninstall' wiki pages in the plugin-ui

### Changed

- ⚠️ `ignoredDevices` configuration option is now an array not a string - [see details](https://gist.github.com/bwp91/90db67d578a8206c5a98a3447839f9e5)
- Reinstated `ipOverride` into the Homebridge plugin UI screen
- Improved colour temperature conversion for L1 and L1 Lite devices
- HTTP error codes will be displayed in the logs if and when the plugin re-attempts the connection
- Error messages refactored to show the most useful information
- [Backend] Major code refactoring
- [Backend] Code comments
- Updated minimum Node to v14.15.5
- Updated minimum Homebridge to v1.1.7
- Updated dependencies

### Removed

- Removed `nameOverride` configuration option - the plugin can now obtain channel names from eWeLink
- Removed `resetRFBridge` option - the same usage can be achieved with `ignoredDevices`

### Fixed

- Fixed a bug where Adaptive Lighting would not be disabled if the colour was changed from the eWeLink app
- Fixed an issue with the 'Lock' Accessory Simulation where the status would never update as 'Unlocked'

## 4.6.1 (2021-02-02)

### Changed

- Extra debug logging for WS reconnection status
- Updated `ws` dependency to v7.4.3

## 4.6.0 (2021-01-30)

### Added

- **[Experimental]** Use a TH10/16 device as a thermostat using an Accessory Simulation [more info](https://github.com/bwp91/homebridge-ewelink/issues/161#issuecomment-770230157)
- Support for the Zigbee type white bulb

### Changed

- Updated plugin-ui-utils dep and use new method to get cached accessories
- Increase the timeout for LAN control to 10 seconds for LAN only settings
- Show LAN update errors in the log

## 4.5.1 (2021-01-28)

### Changed

- Set the switch as the primary service of a TH10/16 device
- Only show the line in error logs if it exists (no more `[line undefined]`)

### Fixed

- Fixes an issue where RF sensors would not use a custom defined type (again!)

## 4.5.0 (2021-01-28)

### Added

- Use a switch to control the `Obstruction Detected` feature of a garage door

### Changed

- More consistent and clearer error logging

### Fixed

- Fix for TH10/16 devices when the HomeKit switch would show the state of 'auto' mode
- Fix for TH10/16 devices (shown as thermostat) where the plugin would not show the current state of the device
- Fix for the display of watts/amps/volts for outlets that support this

## 4.4.5 (2021-01-24)

### Fixed

- Fix where the battery for DW2 device would not update

## 4.4.4 (2021-01-24)

### Changed

- Backend - better handling of errors

## 4.4.3 (2021-01-20)

### Fixed

- Fixes an issue where RF sensors would not use a custom defined type

## 4.4.2 (2021-01-20)

### Changed

- Minimum Homebridge beta needed for Adaptive Lighting bumped to beta-46

### Fixed

- Fixes an issue when adding new RF bridge devices

## 4.4.1 (2021-01-20)

### Changed

- Fakegato logging disabled in Homebridge `debug` mode, can be explicitly enabled with `debugFakegato`

## 4.4.0 (2021-01-14)

### Added

- Single Accessory Simulations for multi-channel devices (e.g. 1 valve using a Sonoff 4CH)
- `operationTime` for Accessory Simulations will now be validated and increased to 20 if less than 20 or an invalid number

### Changed

- ⚠️ **Accessory Simulations** - if use '1 Lock', '1 Tap/Faucet' or '1 Valve' you will need to update your configuration with the Device Setup field (via Homebridge UI) or adding the line `"setup": "oneSwitch"` directly to your configuration file in the groups section
- Changes to plugin now in CHANGELOG.md

### Removed

- Removed `Obstruction Detected` tests

## 4.3.0 (2021-01-12)

### Added

- New Accessory Simulations:
  - 2 Taps/Faucets using a multi-channel device
  - 4 Irrigation Valves using a multi-channel device #182
- New `disableDeviceLogging` config option to hide device state logging #183

### Changed

- `hideDevFromHB` config option renamed to `ignoredDevices`
- Minimum `operationTime` for associated Accessory Simulations increased to 20 (2 seconds)
- Removal of maximum values on plugin settings screen for all `number` types
- Changes to startup log messages
- Adaptive lighting minimum Homebridge beta version is now beta-42
- Backend code changes
- Updated dependencies
