/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceZBSwitchStateless {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.sensorDevices[deviceId]
    this.hideLongDouble = deviceConf && deviceConf.hideLongDouble
    this.lowBattThreshold = deviceConf && deviceConf.lowBattThreshold
      ? Math.min(deviceConf.lowBattThreshold, 100)
      : platform.consts.defaultValues.lowBattThreshold
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Add the stateless switch service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.StatelessProgrammableSwitch) ||
      this.accessory.addService(this.hapServ.StatelessProgrammableSwitch)

    // Hide the double and long press options if the user wants
    if (this.hideLongDouble) {
      this.service.getCharacteristic(this.hapChar.ProgrammableSwitchEvent)
        .setProps({ validValues: [0] })
    }

    // Add the battery service if it doesn't already exist
    this.battService = this.accessory.getService(this.hapServ.BatteryService) ||
      this.accessory.addService(this.hapServ.BatteryService)
  }

  async externalUpdate (params) {
    try {
      if (this.funcs.hasProperty(params, 'battery') && params.battery !== this.cacheBattery) {
        this.cacheBattery = params.battery
        this.battService.updateCharacteristic(this.hapChar.BatteryLevel, this.cacheBattery)
        this.battService.updateCharacteristic(this.hapChar.StatusLowBattery, this.cacheBattery < this.lowBattThreshold)
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current battery [%s%].', this.name, params.battery)
        }
      }
      if (this.funcs.hasProperty(params, 'key') && [0, 1, 2].includes(params.key)) {
        this.service.updateCharacteristic(this.hapChar.ProgrammableSwitchEvent, params.key)
        if (params.updateSource && !this.disableDeviceLogging) {
          const textLabel = params.key === 0 ? 'single' : (params.key === 1 ? 'double' : 'long')
          this.log('[%s] current state [%s press].', this.name, textLabel)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
