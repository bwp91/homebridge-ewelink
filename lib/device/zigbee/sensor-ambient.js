/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceZBSensorAmbient {
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

    // Add the temperature sensor service if it doesn't already exist
    this.tService = this.accessory.getService(this.hapServ.TemperatureSensor) ||
      this.accessory.addService(this.hapServ.TemperatureSensor)

    // Set custom properties of the current temperature characteristic
    this.tService.getCharacteristic(this.hapChar.CurrentTemperature).setProps({
      minValue: -100,
      minStep: 0.1
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
      const eveLog = {}
      if (this.funcs.hasProperty(params, 'temperature') && params.temperature !== this.cacheTemp) {
        this.cacheTemp = params.temperature
        const currentTemp = parseInt(this.cacheTemp) / 100
        this.tService.updateCharacteristic(this.hapChar.CurrentTemperature, currentTemp)
        eveLog.temp = currentTemp
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current temperature [%s].', this.name, currentTemp)
        }
      }
      if (this.funcs.hasProperty(params, 'humidity') && params.humidity !== this.cacheHumi) {
        this.cacheHumi = params.humidity
        const currentHumi = parseInt(this.cacheHumi) / 100
        this.hService.updateCharacteristic(this.hapChar.CurrentRelativeHumidity, currentHumi)
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
}
