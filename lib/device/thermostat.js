'use strict'
let Characteristic, EveHistoryService, Service
const corrInterval = require('correcting-interval')
const fakegato = require('fakegato-history')
module.exports = class deviceThermostat {
  constructor (platform, accessory) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
    EveHistoryService = fakegato(platform.api)
    const tempService = accessory.getService(Service.TemperatureSensor) || accessory.addService(Service.TemperatureSensor)
    let humiService = false
    if (accessory.context.sensorType !== 'DS18B20') {
      humiService = accessory.getService(Service.HumiditySensor) || accessory.addService(Service.HumiditySensor)
    }
    if (!this.platform.config.hideTHSwitch) {
      const switchService = accessory.getService(Service.Switch) || accessory.addService(Service.Switch)
      switchService
        .getCharacteristic(Characteristic.On)
        .on('set', (value, callback) => this.internalUpdate(accessory, value, callback))
    }
    if (!this.platform.config.disableEveLogging) {
      accessory.log = this.platform.log
      accessory.eveLogger = new EveHistoryService('weather', accessory, {
        storage: 'fs',
        minutes: 5,
        path: this.platform.eveLogPath
      })
      corrInterval.setCorrectingInterval(() => {
        const dataToAdd = {
          time: Date.now(),
          temp: tempService.getCharacteristic(Characteristic.CurrentTemperature).value
        }
        if (humiService) {
          dataToAdd.humidity = humiService.getCharacteristic(Characteristic.CurrentRelativeHumidity).value
        }
        accessory.eveLogger.addEntry(dataToAdd)
      }, 300000)
    }
  }

  async internalUpdate (accessory, value, callback) {
    callback()
    try {
      const params = {
        switch: value ? 'on' : 'off',
        mainSwitch: value ? 'on' : 'off'
      }
      const switchService = accessory.getService(Service.Switch)
      await this.platform.sendDeviceUpdate(accessory, params)
      switchService.updateCharacteristic(Characteristic.On, value)
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  externalUpdate (accessory, params) {
    try {
      if (
        !this.platform.config.hideTHSwitch &&
        (Object.prototype.hasOwnProperty.call(params, 'switch') || Object.prototype.hasOwnProperty.call(params, 'mainSwitch'))
      ) {
        const newState = Object.prototype.hasOwnProperty.call(params, 'switch') ? params.switch === 'on' : params.mainSwitch === 'on'
        const switchService = accessory.getService(Service.Switch)
        switchService.updateCharacteristic(Characteristic.On, newState)
      }
      const eveLog = {
        time: Date.now()
      }
      if (Object.prototype.hasOwnProperty.call(params, 'currentTemperature') && accessory.getService(Service.TemperatureSensor)) {
        const currentTemp = parseFloat(params.currentTemperature !== 'unavailable' ? params.currentTemperature : 0)
        accessory
          .getService(Service.TemperatureSensor)
          .updateCharacteristic(Characteristic.CurrentTemperature, currentTemp)
        eveLog.temp = currentTemp
      }
      if (Object.prototype.hasOwnProperty.call(params, 'currentHumidity') && accessory.getService(Service.HumiditySensor)) {
        const currentHumi = parseFloat(params.currentHumidity !== 'unavailable' ? params.currentHumidity : 0)
        accessory
          .getService(Service.HumiditySensor)
          .updateCharacteristic(Characteristic.CurrentRelativeHumidity, currentHumi)
        eveLog.humidity = currentHumi
      }
      if (!this.platform.config.disableEveLogging) {
        if (Object.prototype.hasOwnProperty.call(eveLog, 'temp') || Object.prototype.hasOwnProperty.call(eveLog, 'humidity')) {
          accessory.eveLogger.addEntry(eveLog)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
