/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const util = require('util')
module.exports = class deviceZBSensorContact {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    this.dName = accessory.displayName
    this.accessory = accessory

    const self = this
    this.eveLastActivation = function () {
      self.C.call(this, 'Last Activation', self.helpers.eveUUID.lastActivation)
      this.setProps({
        format: self.C.Formats.UINT32,
        unit: self.C.Units.SECONDS,
        perms: [self.C.Perms.READ, self.C.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    util.inherits(this.eveLastActivation, this.C)
    this.eveLastActivation.UUID = this.helpers.eveUUID.lastActivation
    this.lowBattThreshold = parseInt(this.platform.config.lowBattThreshold)
    this.lowBattThreshold = isNaN(this.lowBattThreshold) || this.lowBattThreshold < 5
      ? this.helpers.defaults.lowBattThreshold
      : this.lowBattThreshold

    this.service = this.accessory.getService(this.S.ContactSensor) || this.accessory.addService(this.S.ContactSensor)
    this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
    this.accessory.historyService = new this.platform.eveService('door', this.accessory, {
      storage: 'fs',
      path: platform.eveLogPath
    })
    this.battService = this.accessory.getService(this.S.BatteryService) || this.accessory.addService(this.S.BatteryService)
  }

  async externalUpdate (params) {
    try {
      if (this.helpers.hasProperty(params, 'battery') && params.battery !== this.cacheBattery) {
        this.cacheBattery = params.battery
        const scaledBatt = this.platform.config.ZBDWBatt ? this.cacheBattery * 10 : this.cacheBattery
        this.battService.updateCharacteristic(this.C.BatteryLevel, scaledBatt)
        this.battService.updateCharacteristic(this.C.StatusLowBattery, scaledBatt < this.lowBattThreshold)
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current battery [%s%].', this.dName, scaledBatt)
        }
      }
      if (this.helpers.hasProperty(params, 'lock') && [0, 1].includes(params.lock)) {
        this.service.updateCharacteristic(this.C.ContactSensorState, params.lock)
        if (params.lock === 1) {
          this.service.updateCharacteristic(
            this.eveLastActivation,
            Math.round(new Date().valueOf() / 1000) - this.accessory.historyService.getInitialTime()
          )
        }
        this.accessory.historyService.addEntry({
          time: Math.round(new Date().valueOf() / 1000),
          status: params.lock
        })
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [contact%s detected].', this.dName, params.lock === 0 ? '' : ' not')
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
