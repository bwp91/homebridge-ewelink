/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceZBSensorMotion {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.eveChar = platform.eveChar
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
    this.lowBattThreshold = deviceConf && deviceConf.lowBattThreshold
      ? Math.min(deviceConf.lowBattThreshold, 100)
      : platform.consts.defaultValues.lowBattThreshold
    this.sensorTimeDifference = deviceConf && deviceConf.sensorTimeDifference
      ? deviceConf.sensorTimeDifference
      : platform.consts.defaultValues.sensorTimeDifference
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Add the motion sensor service if it doesn't already exist
    if (!(this.service = this.accessory.getService(this.hapServ.MotionSensor))) {
      this.service = this.accessory.addService(this.hapServ.MotionSensor)
      this.service.addCharacteristic(this.eveChar.LastActivation)
    }

    // Add the battery service if it doesn't already exist
    this.battService = this.accessory.getService(this.hapServ.BatteryService) || this.accessory.addService(this.hapServ.BatteryService)

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('motion', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log if in debug mode
    if (platform.config.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        lowBattThreshold: this.lowBattThreshold,
        sensorTimeDifference: this.sensorTimeDifference
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async externalUpdate (params) {
    try {
      if (
        this.funcs.hasProperty(params, 'battery') &&
        params.battery !== this.cacheBatt
      ) {
        this.cacheBatt = params.battery
        this.battService.updateCharacteristic(this.hapChar.BatteryLevel, this.cacheBatt)
        this.battService.updateCharacteristic(
          this.hapChar.StatusLowBattery,
          this.cacheBatt < this.lowBattThreshold
        )
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s%].', this.name, this.lang.curBatt, this.cacheBatt)
        }
      }
      if (
        this.funcs.hasProperty(params, 'motion') &&
        this.funcs.hasProperty(params, 'trigTime')
      ) {
        const timeNow = new Date()
        const diff = (timeNow.getTime() - params.trigTime) / 1000
        const motionDetected = !!(params.updateSource &&
          params.motion === 1 &&
          diff < this.sensorTimeDifference)
        this.service.updateCharacteristic(this.hapChar.MotionDetected, motionDetected)
        if (motionDetected) {
          const initialTime = this.accessory.eveService.getInitialTime()
          this.service.updateCharacteristic(
            this.eveChar.LastActivation,
            Math.round(new Date().valueOf() / 1000) - initialTime
          )
        }
        this.accessory.eveService.addEntry({ status: motionDetected ? 1 : 0 })
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log(
            '[%s] %s [%s].',
            this.name,
            this.lang.curState,
            motionDetected ? this.lang.motionYes : this.lang.motionNo
          )
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
