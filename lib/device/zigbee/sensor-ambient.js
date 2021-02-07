/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceZBSensorAmbient {
  constructor (platform, accessory) {
    this.platform = platform
    this.funcs = platform.funcs
    this.messages = platform.messages
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.name = accessory.displayName
    this.accessory = accessory

    this.lowBattThreshold = parseInt(this.platform.config.lowBattThreshold)
    this.lowBattThreshold = isNaN(this.lowBattThreshold) || this.lowBattThreshold < 5
      ? this.consts.defaults.lowBattThreshold
      : this.lowBattThreshold

    this.tService = this.accessory.getService(this.hapServ.TemperatureSensor) || this.accessory.addService(this.hapServ.TemperatureSensor)
    this.tService.getCharacteristic(this.hapChar.CurrentTemperature)
      .setProps({ minValue: -100 })
    this.hService = this.accessory.getService(this.hapServ.HumiditySensor) || this.accessory.addService(this.hapServ.HumiditySensor)
    this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
    this.accessory.historyService = new this.platform.eveService('weather', this.accessory, {
      storage: 'fs',
      path: platform.eveLogPath
    })
    this.battService = this.accessory.getService(this.hapServ.BatteryService) || this.accessory.addService(this.hapServ.BatteryService)
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
        this.accessory.historyService.addEntry(eveLog)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
