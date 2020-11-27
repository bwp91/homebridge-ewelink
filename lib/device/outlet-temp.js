/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const helpers = require('./../helpers')
module.exports = class deviceOutletTemp {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    if (accessory.getService(this.Service.Thermostat)) {
      accessory.removeService(accessory.getService(this.Service.Thermostat))
    }
    if ((this.platform.config.hideSwitchFromTH || '').includes(accessory.context.eweDeviceId)) {
      if (accessory.getService(this.Service.Switch)) {
        accessory.removeService(accessory.getService(this.Service.Switch))
      }
    } else {
      this.switchService = accessory.getService(this.Service.Switch) || accessory.addService(this.Service.Switch)
      this.switchService
        .getCharacteristic(this.Characteristic.On)
        .on('set', this.internalUpdate.bind(this))
    }
    this.tempService = accessory.getService(this.Service.TemperatureSensor) || accessory.addService(this.Service.TemperatureSensor)
    this.tempService.getCharacteristic(this.Characteristic.CurrentTemperature)
      .setProps({
        minValue: -100
      })
    if (accessory.context.sensorType !== 'DS18B20') {
      this.humiService = accessory.getService(this.Service.HumiditySensor) || accessory.addService(this.Service.HumiditySensor)
    }
    accessory.log = this.platform.log
    accessory.eveLogger = new this.platform.eveService('custom', accessory, {
      storage: 'fs',
      path: this.platform.eveLogPath
    })
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      const params = {
        switch: value ? 'on' : 'off',
        mainSwitch: value ? 'on' : 'off'
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (
        !(this.platform.config.hideSwitchFromTH || '').includes(this.accessory.context.eweDeviceId) &&
        (helpers.hasProperty(params, 'switch') || helpers.hasProperty(params, 'mainSwitch'))
      ) {
        const newState = helpers.hasProperty(params, 'switch') ? params.switch === 'on' : params.mainSwitch === 'on'
        this.switchService.updateCharacteristic(this.Characteristic.On, newState)
        this.accessory.eveLogger.addEntry({
          time: Math.round(new Date().valueOf() / 1000),
          status: newState ? 1 : 0
        })
      }
      const eveLog = { time: Math.round(new Date().valueOf() / 1000) }
      if (helpers.hasProperty(params, 'currentTemperature') && this.accessory.getService(this.Service.TemperatureSensor)) {
        const currentTemp = parseFloat(params.currentTemperature !== 'unavailable' ? params.currentTemperature : 0)
        this.tempService.updateCharacteristic(this.Characteristic.CurrentTemperature, currentTemp)
        eveLog.temp = currentTemp
      }
      if (helpers.hasProperty(params, 'currentHumidity') && this.accessory.getService(this.Service.HumiditySensor)) {
        const currentHumi = parseFloat(params.currentHumidity !== 'unavailable' ? params.currentHumidity : 0)
        this.humiService.updateCharacteristic(this.Characteristic.CurrentRelativeHumidity, currentHumi)
        eveLog.humidity = currentHumi
      }
      if (helpers.hasProperty(eveLog, 'temp') || helpers.hasProperty(eveLog, 'humidity')) {
        this.accessory.eveLogger.addEntry(eveLog)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
