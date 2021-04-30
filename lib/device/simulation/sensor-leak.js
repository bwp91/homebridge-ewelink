/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSensorLeak {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.eveChar = platform.eveChar
    this.log = platform.log
    this.lang = platform.lang
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.sensorDevices[deviceId]
    const deviceConf2 = platform.simulations[deviceId]
    this.lowBattThreshold = deviceConf && deviceConf.lowBattThreshold
      ? Math.min(deviceConf.lowBattThreshold, 100)
      : platform.consts.defaultValues.lowBattThreshold
    this.disableDeviceLogging = (deviceConf && deviceConf.overrideDisabledLogging) ||
      deviceConf2.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // If the accessory has a contact sensor service then remove it
    if (this.accessory.getService(this.hapServ.ContactSensor)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.ContactSensor))
    }

    // Add the leak sensor service if it doesn't already exist
    if (!(this.service = this.accessory.getService(this.hapServ.LeakSensor))) {
      this.service = this.accessory.addService(this.hapServ.LeakSensor)
      this.service.addCharacteristic(this.eveChar.LastActivation)
    }

    // Add the battery service if it doesn't already exist
    this.batteryService = this.accessory.getService(this.hapServ.BatteryService) ||
      this.accessory.addService(this.hapServ.BatteryService)

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('door', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        lowBattThreshold: this.lowBattThreshold,
        type: deviceConf.type
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.funcs.hasProperty(params, 'battery')) {
        const scaledBattery = Math.round(params.battery * 33.3)
        if (this.cacheBattery !== scaledBattery) {
          this.cacheBattery = scaledBattery
          this.batteryService.updateCharacteristic(
            this.hapChar.BatteryLevel,
            this.cacheBattery
          )
          this.batteryService.updateCharacteristic(
            this.hapChar.StatusLowBattery,
            this.cacheBattery < this.lowBattThreshold
          )
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current battery [%s%].', this.name, this.cacheBattery)
          }
        }
      }
      if (!params.switch || params.switch === this.cacheOnOff) {
        return
      }
      this.cacheOnOff = params.switch
      const newState = params.switch === 'on' ? 0 : 1
      this.service.updateCharacteristic(this.hapChar.LeakDetected, newState)
      this.accessory.eveService.addEntry({ status: newState })
      if (newState === 1) {
        const initialTime = this.accessory.eveService.getInitialTime()
        this.service.updateCharacteristic(
          this.eveChar.LastActivation,
          Math.round(new Date().valueOf() / 1000) - initialTime
        )
      }
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log(
          '[%s] current state [water%s detected].',
          this.name,
          newState === 1 ? '' : ' not'
        )
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
