'use strict'
let Characteristic, Service
module.exports = class deviceThermostat {
  constructor (platform) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
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
