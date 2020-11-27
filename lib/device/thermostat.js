/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const helpers = require('./../helpers')
module.exports = class deviceThermostat {
  constructor (platform, accessory) {
    /*
    ”9.32 Current Heating Cooling State” (page 173)
    ”9.119 Target Heating Cooling State” (page 230)
    ”9.35 Current Temperature” (page 175)
    ”9.121 Target Temperature” (page 231)
    ”9.122 Temperature Display Units” (page 231)
    */
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    if (accessory.getService(this.Service.Switch)) {
      accessory.removeService(accessory.getService(this.Service.Switch))
    }
    if (accessory.getService(this.Service.TemperatureSensor)) {
      accessory.removeService(accessory.getService(this.Service.TemperatureSensor))
    }
    if (accessory.getService(this.Service.HumiditySensor)) {
      accessory.removeService(accessory.getService(this.Service.HumiditySensor))
    }
    this.service = accessory.getService(this.Service.Thermostat) || accessory.addService(this.Service.Thermostat)
    this.service.getCharacteristic(this.Characteristic.CurrentTemperature)
      .setProps({
        minValue: -100
      })
    
    this.service
      .getCharacteristic(this.Characteristic.TargetHeatingCoolingState)
      .on('set', this.internalStateUpdate.bind(this))
      .setProps({
        validValues: [0, 3]
      })
    this.service
      .getCharacteristic(this.Characteristic.TargetTemperature)
      .on('set', this.internalTempUpdate.bind(this))
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
