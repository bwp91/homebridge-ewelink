/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceZBSwitchStateless {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    this.lowBattThreshold = parseInt(this.platform.config.lowBattThreshold)
    this.lowBattThreshold = isNaN(this.lowBattThreshold) || this.lowBattThreshold < 5
      ? this.consts.defaults.lowBattThreshold
      : this.lowBattThreshold

    const ssp = this.hapServ.StatelessProgrammableSwitch
    this.service = this.accessory.getService(ssp) || this.accessory.addService(ssp)
    if (this.platform.config.hideZBLDPress) {
      this.service.getCharacteristic(this.hapChar.ProgrammableSwitchEvent)
        .setProps({ validValues: [0] })
    }
    this.battService = this.accessory.getService(this.hapServ.BatteryService) || this.accessory.addService(this.hapServ.BatteryService)
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
