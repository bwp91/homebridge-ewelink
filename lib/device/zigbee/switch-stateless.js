/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceZBSwitchStateless {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.funcs = platform.funcs
    this.hapChar = platform.api.hap.Characteristic
    this.hapServ = platform.api.hap.Service
    this.lang = platform.lang
    this.log = platform.log
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceConf = platform.sensorDevices[accessory.context.eweDeviceId]
    this.hideLongDouble = deviceConf && deviceConf.hideLongDouble
    this.lowBattThreshold =
      deviceConf && deviceConf.lowBattThreshold
        ? Math.min(deviceConf.lowBattThreshold, 100)
        : platform.consts.defaultValues.lowBattThreshold
    this.disableDeviceLogging =
      deviceConf && deviceConf.overrideDisabledLogging
        ? false
        : platform.config.disableDeviceLogging

    // Add the stateless switch service if it doesn't already exist
    this.service =
      this.accessory.getService(this.hapServ.StatelessProgrammableSwitch) ||
      this.accessory.addService(this.hapServ.StatelessProgrammableSwitch)

    // Hide the double and long press options if the user wants
    if (this.hideLongDouble) {
      this.service.getCharacteristic(this.hapChar.ProgrammableSwitchEvent).setProps({
        validValues: [0]
      })
    }

    // Add the battery service if it doesn't already exist
    this.battService =
      this.accessory.getService(this.hapServ.BatteryService) ||
      this.accessory.addService(this.hapServ.BatteryService)

    // Output the customised options to the log if in debug mode
    if (platform.config.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        hideLongDouble: this.hideLongDouble,
        lowBattThreshold: this.lowBattThreshold
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.funcs.hasProperty(params, 'battery') && params.battery !== this.cacheBatt) {
        this.cacheBatt = params.battery
        this.cacheBattScaled = Math.max(Math.min(this.cacheBatt, 100), 0)
        this.battService.updateCharacteristic(this.hapChar.BatteryLevel, this.cacheBattScaled)
        this.battService.updateCharacteristic(
          this.hapChar.StatusLowBattery,
          this.cacheBattScaled < this.lowBattThreshold
        )
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s%].', this.name, this.lang.curBatt, this.cacheBattScaled)
        }
      }
      if (this.funcs.hasProperty(params, 'key') && [0, 1, 2].includes(params.key)) {
        this.service.updateCharacteristic(this.hapChar.ProgrammableSwitchEvent, params.key)
        if (params.updateSource && !this.disableDeviceLogging) {
          const textLabel =
            params.key === 0
              ? this.lang.buttonSingle
              : params.key === 1
              ? this.lang.buttonDouble
              : this.lang.buttonLong
          this.log('[%s] %s [%s].', this.name, this.lang.curState, textLabel)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
