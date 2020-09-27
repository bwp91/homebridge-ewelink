'use strict'
let Characteristic, Service
module.exports = class deviceThermostat {
  constructor (platform, homebridge) {
    this.platform = platform
  }

  async internalThermostatUpdate (accessory, value, callback) {
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
      this.platform.requestDeviceRefresh(accessory, err)
    }
  }

  externalThermostatUpdate (accessory, params) {
    try {
      if (
        !this.platform.config.hideTHSwitch &&
        (Object.prototype.hasOwnProperty.call(params, 'switch') || Object.prototype.hasOwnProperty.call(params, 'mainSwitch'))
      ) {
        const newState = Object.prototype.hasOwnProperty.call(params, 'switch') ? params.switch === 'on' : params.mainSwitch === 'on'
        const switchService = accessory.getService(Service.Switch)
        switchService.updateCharacteristic(Characteristic.On, newState)
      }
      if (!(this.platform.config.disableEveLogging || false)) {
        const eveLog = {
          time: Date.now()
        }
        if (Object.prototype.hasOwnProperty.call(params, 'currentTemperature') && accessory.getService(Service.TemperatureSensor)) {
          const currentTemp = params.currentTemperature !== 'unavailable' ? params.currentTemperature : 0
          accessory
            .getService(Service.TemperatureSensor)
            .updateCharacteristic(Characteristic.CurrentTemperature, currentTemp)
          eveLog.temp = parseFloat(currentTemp)
        }
        if (Object.prototype.hasOwnProperty.call(params, 'currentHumidity') && accessory.getService(Service.HumiditySensor)) {
          const currentHumi = params.currentHumidity !== 'unavailable' ? params.currentHumidity : 0
          accessory
            .getService(Service.HumiditySensor)
            .updateCharacteristic(Characteristic.CurrentRelativeHumidity, currentHumi)
          eveLog.humidity = parseFloat(currentHumi)
        }
        if (Object.prototype.hasOwnProperty.call(eveLog, 'temp') || Object.prototype.hasOwnProperty.call(eveLog, 'humidity')) {
          accessory.eveLogger.addEntry(eveLog)
        }
      }
    } catch (err) {
      this.platform.log.warn('[%s] could not be updated as %s.', accessory.displayName, err)
    }
  }
}
