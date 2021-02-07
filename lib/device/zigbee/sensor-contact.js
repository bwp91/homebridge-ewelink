/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceZBSensorContact {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
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

    this.inherits = require('util').inherits
    const self = this
    this.eveLastActivation = function () {
      self.hapChar.call(this, 'Last Activation', self.consts.eveUUID.lastActivation)
      this.setProps({
        format: self.hapChar.Formats.UINT32,
        unit: self.hapChar.Units.SECONDS,
        perms: [self.hapChar.Perms.READ, self.hapChar.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.inherits(this.eveLastActivation, this.hapChar)
    this.eveLastActivation.UUID = this.consts.eveUUID.lastActivation
    this.lowBattThreshold = parseInt(this.platform.config.lowBattThreshold)
    this.lowBattThreshold = isNaN(this.lowBattThreshold) || this.lowBattThreshold < 5
      ? this.consts.defaultValues.lowBattThreshold
      : this.lowBattThreshold

    this.service = this.accessory.getService(this.hapServ.ContactSensor) || this.accessory.addService(this.hapServ.ContactSensor)
    this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
    this.accessory.historyService = new this.platform.eveService('door', this.accessory, {
      storage: 'fs',
      path: platform.eveLogPath
    })
    this.battService = this.accessory.getService(this.hapServ.BatteryService) || this.accessory.addService(this.hapServ.BatteryService)
  }

  async externalUpdate (params) {
    try {
      if (this.funcs.hasProperty(params, 'battery') && params.battery !== this.cacheBattery) {
        this.cacheBattery = params.battery
        const scaledBatt = this.platform.config.ZBDWBatt ? this.cacheBattery * 10 : this.cacheBattery
        this.battService.updateCharacteristic(this.hapChar.BatteryLevel, scaledBatt)
        this.battService.updateCharacteristic(this.hapChar.StatusLowBattery, scaledBatt < this.lowBattThreshold)
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current battery [%s%].', this.name, scaledBatt)
        }
      }
      if (this.funcs.hasProperty(params, 'lock') && [0, 1].includes(params.lock)) {
        this.service.updateCharacteristic(this.hapChar.ContactSensorState, params.lock)
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
          this.log('[%s] current state [contact%s detected].', this.name, params.lock === 0 ? '' : ' not')
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
