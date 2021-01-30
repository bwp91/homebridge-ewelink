/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceZBSensorAmbient {
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

    this.tService = this.accessory.getService(this.S.TemperatureSensor) || this.accessory.addService(this.S.TemperatureSensor)
    this.tService.getCharacteristic(this.C.CurrentTemperature)
      .setProps({ minValue: -100 })
    this.hService = this.accessory.getService(this.S.HumiditySensor) || this.accessory.addService(this.S.HumiditySensor)
    this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
    this.accessory.historyService = new this.platform.eveService('weather', this.accessory, {
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
      const eveLog = {}
      if (this.helpers.hasProperty(params, 'temperature') && params.temperature !== this.cacheTemp) {
        this.cacheTemp = params.temperature
        const currentTemp = parseInt(this.cacheTemp) / 100
        this.tService.updateCharacteristic(this.C.CurrentTemperature, currentTemp)
        eveLog.temp = currentTemp
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current temperature [%s].', this.dName, currentTemp)
        }
      }
      if (this.helpers.hasProperty(params, 'humidity') && params.humidity !== this.cacheHumi) {
        this.cacheHumi = params.humidity
        const currentHumi = parseInt(this.cacheHumi) / 100
        this.hService.updateCharacteristic(this.C.CurrentRelativeHumidity, currentHumi)
        eveLog.humidity = currentHumi
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current humidity [%s].', this.dName, currentHumi)
        }
      }
      if (eveLog.temp || eveLog.humidity) {
        eveLog.time = Math.round(new Date().valueOf() / 1000)
        this.accessory.historyService.addEntry(eveLog)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
