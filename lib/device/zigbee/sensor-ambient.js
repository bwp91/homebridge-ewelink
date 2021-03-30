/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceZBSensorAmbient {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
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
    this.lowBattThreshold = deviceConf && deviceConf.lowBattThreshold
      ? Math.min(deviceConf.lowBattThreshold, 100)
      : platform.consts.defaultValues.lowBattThreshold
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Add the temperature sensor service if it doesn't already exist
    this.tService = this.accessory.getService(this.hapServ.TemperatureSensor) ||
      this.accessory.addService(this.hapServ.TemperatureSensor)

    // Add the get handler to the current temperature characteristic
    this.tService.getCharacteristic(this.hapChar.CurrentTemperature)
      .setProps({ minStep: 0.1 })
      .onGet(() => {
        if (this.isOnline) {
          return this.tService.getCharacteristic(this.hapChar.CurrentTemperature).value
        } else {
          throw new this.platform.api.hap.HapStatusError(-70402)
        }
      })

    // Add the humidity sensor service if it doesn't already exist
    this.hService = this.accessory.getService(this.hapServ.HumiditySensor) ||
      this.accessory.addService(this.hapServ.HumiditySensor)

    // Add the battery service if it doesn't already exist
    this.battService = this.accessory.getService(this.hapServ.BatteryService) ||
      this.accessory.addService(this.hapServ.BatteryService)

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('weather', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        lowBattThreshold: this.lowBattThreshold
      })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
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
          this.log('[%s] current battery [%s%].', this.name, this.cacheBatt)
        }
      }
      const eveLog = {}
      if (
        this.funcs.hasProperty(params, 'temperature') &&
        params.temperature !== this.cacheTemp
      ) {
        this.cacheTemp = params.temperature
        const currentTemp = parseInt(this.cacheTemp) / 100
        this.tService.updateCharacteristic(this.hapChar.CurrentTemperature, currentTemp)
        eveLog.temp = currentTemp
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current temperature [%s].', this.name, currentTemp)
        }
      }
      if (
        this.funcs.hasProperty(params, 'humidity') &&
        params.humidity !== this.cacheHumi
      ) {
        this.cacheHumi = params.humidity
        const currentHumi = parseInt(this.cacheHumi) / 100
        this.hService.updateCharacteristic(
          this.hapChar.CurrentRelativeHumidity,
          currentHumi
        )
        eveLog.humidity = currentHumi
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current humidity [%s].', this.name, currentHumi)
        }
      }
      if (eveLog.temp || eveLog.humidity) {
        eveLog.time = Math.round(new Date().valueOf() / 1000)
        this.accessory.eveService.addEntry(eveLog)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
