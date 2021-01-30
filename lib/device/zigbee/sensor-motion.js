/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceZBSensorMotion {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    this.dName = accessory.displayName
    this.accessory = accessory

    this.inherits = require('util').inherits
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
    this.inherits(this.eveLastActivation, this.C)
    this.eveLastActivation.UUID = this.helpers.eveUUID.lastActivation
    this.lowBattThreshold = parseInt(this.platform.config.lowBattThreshold)
    this.lowBattThreshold = isNaN(this.lowBattThreshold) || this.lowBattThreshold < 5
      ? this.helpers.defaults.lowBattThreshold
      : this.lowBattThreshold
    this.sensorTimeDifference = parseInt(this.platform.config.sensorTimeDifference)
    this.sensorTimeDifference = isNaN(this.sensorTimeDifference) || this.sensorTimeDifference < 10
      ? this.helpers.defaults.sensorTimeDifference
      : this.sensorTimeDifference

    this.service = this.accessory.getService(this.S.MotionSensor) || this.accessory.addService(this.S.MotionSensor)
    this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
    this.accessory.historyService = new this.platform.eveService('motion', this.accessory, {
      storage: 'fs',
      path: platform.eveLogPath
    })
    this.battService = this.accessory.getService(this.S.BatteryService) || this.accessory.addService(this.S.BatteryService)
  }

  async externalUpdate (params) {
    try {
      if (this.helpers.hasProperty(params, 'battery') && params.battery !== this.cacheBattery) {
        this.cacheBattery = params.battery
        this.battService.updateCharacteristic(this.C.BatteryLevel, this.cacheBattery)
        this.battService.updateCharacteristic(this.C.StatusLowBattery, this.cacheBattery < this.lowBattThreshold)
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current battery [%s%].', this.dName, this.cacheBattery)
        }
      }
      if (this.helpers.hasProperty(params, 'motion') && this.helpers.hasProperty(params, 'trigTime')) {
        const timeNow = new Date()
        const diff = (timeNow.getTime() - params.trigTime) / 1000
        const motionDetected = params.updateSource && params.motion === 1 && diff < this.sensorTimeDifference
        this.service.updateCharacteristic(this.C.MotionDetected, motionDetected)
        if (motionDetected) {
          this.service.updateCharacteristic(
            this.eveLastActivation,
            Math.round(new Date().valueOf() / 1000) - this.accessory.historyService.getInitialTime()
          )
        }
        this.accessory.historyService.addEntry({
          time: Math.round(new Date().valueOf() / 1000),
          status: motionDetected ? 1 : 0
        })
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [motion%s detected].', this.dName, motionDetected ? '' : ' not')
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
