/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceZBSensorMotion {
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

    // Set up custom variables for this device type
    this.lowBattThreshold = this.platform.config.lowBattThreshold
    this.sensorTimeDifference = this.platform.config.sensorTimeDifference

    // Set up the custom Eve characteristics for this device type
    this.inherits = require('util').inherits
    const self = this
    this.eveLastActivation = function () {
      self.hapChar.call(this, 'Last Activation', self.consts.eve.lastActivation)
      this.setProps({
        format: self.hapChar.Formats.UINT32,
        unit: self.hapChar.Units.SECONDS,
        perms: [self.hapChar.Perms.READ, self.hapChar.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.inherits(this.eveLastActivation, this.hapChar)
    this.eveLastActivation.UUID = this.consts.eve.lastActivation

    // Add the motion sensor service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.MotionSensor) ||
      this.accessory.addService(this.hapServ.MotionSensor)

    // Add the battery service if it doesn't already exist
    this.battService = this.accessory.getService(this.hapServ.BatteryService) || this.accessory.addService(this.hapServ.BatteryService)

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
    this.accessory.eveService = new this.platform.eveService('motion', this.accessory, {
      storage: 'fs',
      path: platform.eveLogPath
    })
  }

  async externalUpdate (params) {
    try {
      if (this.funcs.hasProperty(params, 'battery') && params.battery !== this.cacheBattery) {
        this.cacheBattery = params.battery
        this.battService.updateCharacteristic(this.hapChar.BatteryLevel, this.cacheBattery)
        this.battService.updateCharacteristic(this.hapChar.StatusLowBattery, this.cacheBattery < this.lowBattThreshold)
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current battery [%s%].', this.name, this.cacheBattery)
        }
      }
      if (this.funcs.hasProperty(params, 'motion') && this.funcs.hasProperty(params, 'trigTime')) {
        const timeNow = new Date()
        const diff = (timeNow.getTime() - params.trigTime) / 1000
        const motionDetected = params.updateSource && params.motion === 1 && diff < this.sensorTimeDifference
        this.service.updateCharacteristic(this.hapChar.MotionDetected, motionDetected)
        if (motionDetected) {
          this.service.updateCharacteristic(
            this.eveLastActivation,
            Math.round(new Date().valueOf() / 1000) - this.accessory.eveService.getInitialTime()
          )
        }
        this.accessory.eveService.addEntry({
          time: Math.round(new Date().valueOf() / 1000),
          status: motionDetected ? 1 : 0
        })
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [motion%s detected].', this.name, motionDetected ? '' : ' not')
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
