/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceZBSwitchStateless {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    this.dName = accessory.displayName
    this.accessory = accessory

    this.lowBattThreshold = parseInt(this.platform.config.lowBattThreshold)
    this.lowBattThreshold = isNaN(this.lowBattThreshold) || this.lowBattThreshold < 5
      ? this.helpers.defaults.lowBattThreshold
      : this.lowBattThreshold

    const ssp = this.S.StatelessProgrammableSwitch
    this.service = this.accessory.getService(ssp) || this.accessory.addService(ssp)
    if (this.platform.config.hideZBLDPress) {
      this.service.getCharacteristic(this.C.ProgrammableSwitchEvent)
        .setProps({ validValues: [0] })
    }
    this.battService = this.accessory.getService(this.S.BatteryService) || this.accessory.addService(this.S.BatteryService)
  }

  async externalUpdate (params) {
    try {
      if (this.helpers.hasProperty(params, 'battery') && params.battery !== this.cacheBattery) {
        this.cacheBattery = params.battery
        this.battService.updateCharacteristic(this.C.BatteryLevel, this.cacheBattery)
        this.battService.updateCharacteristic(this.C.StatusLowBattery, this.cacheBattery < this.lowBattThreshold)
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current battery [%s%].', this.dName, params.battery)
        }
      }
      if (this.helpers.hasProperty(params, 'key') && [0, 1, 2].includes(params.key)) {
        this.service.updateCharacteristic(this.C.ProgrammableSwitchEvent, params.key)
        if (params.updateSource && !this.disableDeviceLogging) {
          const textLabel = params.key === 0 ? 'single' : (params.key === 1 ? 'double' : 'long')
          this.log('[%s] current state [%s press].', this.dName, textLabel)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
