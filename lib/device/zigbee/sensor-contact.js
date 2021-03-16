/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceZBSensorContact {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.eveChar = platform.eveChar
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.sensorDevices[deviceId]
    this.scaleBattery = deviceConf && deviceConf.scaleBattery
    this.lowBattThreshold = deviceConf && deviceConf.lowBattThreshold
      ? Math.min(deviceConf.lowBattThreshold, 100)
      : platform.consts.defaultValues.lowBattThreshold
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Add the contact sensor service if it doesn't already exist
    if (!(this.service = this.accessory.getService(this.hapServ.ContactSensor))) {
      this.service = this.accessory.addService(this.hapServ.ContactSensor)
      this.service.addCharacteristic(this.eveChar.LastActivation)
      this.service.addCharacteristic(this.eveChar.ResetTotal)
      this.service.addCharacteristic(this.eveChar.OpenDuration)
      this.service.addCharacteristic(this.eveChar.ClosedDuration)
      this.service.addCharacteristic(this.eveChar.TimesOpened)
    }

    // Obtain the current times opened value
    this.timesOpened = this.service.getCharacteristic(this.eveChar.TimesOpened).value

    // Add the set handler to the contact sensor reset total characteristic
    this.service.getCharacteristic(this.eveChar.ResetTotal)
      .on('set', (value, callback) => {
        callback()
        this.timesOpened = 0
        this.service.updateCharacteristic(this.eveChar.TimesOpened, 0)
      })

    // Add the battery service if it doesn't already exist
    this.battService = this.accessory.getService(this.hapServ.BatteryService) ||
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
        scaleBattery: this.scaleBattery
      })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async externalUpdate (params) {
    try {
      if (
        this.funcs.hasProperty(params, 'battery') &&
        params.battery !== this.cacheBattery
      ) {
        this.cacheBattery = params.battery
        const scaledBatt = this.scaleBattery ? this.cacheBattery * 10 : this.cacheBattery
        this.battService.updateCharacteristic(this.hapChar.BatteryLevel, scaledBatt)
        this.battService.updateCharacteristic(
          this.hapChar.StatusLowBattery,
          scaledBatt < this.lowBattThreshold
        )
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current battery [%s%].', this.name, scaledBatt)
        }
      }
      if (this.funcs.hasProperty(params, 'lock') && [0, 1].includes(params.lock)) {
        this.service.updateCharacteristic(this.hapChar.ContactSensorState, params.lock)
        if (params.lock === 1) {
          this.service.updateCharacteristic(this.hapChar.ContactSensorState, 1)
          this.accessory.eveService.addEntry({ status: 1 })
          const initialTime = this.accessory.eveService.getInitialTime()
          this.service.updateCharacteristic(
            this.eveChar.LastActivation,
            Math.round(new Date().valueOf() / 1000) - initialTime
          )
          this.timesOpened++
          this.service.updateCharacteristic(this.eveChar.TimesOpened, this.timesOpened)
        } else {
          this.service.updateCharacteristic(this.hapChar.ContactSensorState, 0)
          this.accessory.eveService.addEntry({ status: 0 })
        }
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log(
            '[%s] current state [contact%s detected].',
            this.name,
            params.lock === 0 ? '' : ' not'
          )
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
