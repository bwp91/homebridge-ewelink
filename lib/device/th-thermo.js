/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceTHThermo {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    this.dName = accessory.displayName
    this.accessory = accessory

    this.tempOffset = parseFloat(platform.thTempOffset[this.accessory.context.eweDeviceId] || 0)
    if (this.accessory.getService(this.S.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.S.Switch))
    }
    if (this.accessory.getService(this.S.TemperatureSensor)) {
      this.accessory.removeService(this.accessory.getService(this.S.TemperatureSensor))
    }
    if (this.accessory.getService(this.S.HumiditySensor)) {
      this.accessory.removeService(this.accessory.getService(this.S.HumiditySensor))
    }
    this.service = this.accessory.getService(this.S.Thermostat) || this.accessory.addService(this.S.Thermostat)
    this.service.getCharacteristic(this.C.CurrentTemperature)
      .setProps({ minValue: -100 })
    this.service.getCharacteristic(this.C.TargetHeatingCoolingState)
      .on('set', this.internalOnOffUpdate.bind(this))
      .setProps({ validValues: [0, 1] })
    this.service.getCharacteristic(this.C.TargetTemperature)
      .on('set', this.internalTempUpdate.bind(this))
    if (this.accessory.context.sensorType !== 'DS18B20' && !this.service.testCharacteristic(this.C.CurrentRelativeHumidity)) {
      this.service.addCharacteristic(this.C.CurrentRelativeHumidity)
    }
    this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
    this.accessory.historyService = new this.platform.eveService('custom', this.accessory, {
      storage: 'fs',
      path: platform.eveLogPath
    })
  }

  async internalOnOffUpdate (value, callback) {
    try {
      callback()
      const params = {
        switch: value !== 0 ? 'on' : 'off',
        mainSwitch: value !== 0 ? 'on' : 'off'
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheOnOff = value !== 0 ? 'on' : 'off'
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.dName, this.cacheOnOff)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalTempUpdate (value, callback) {
    try {
      callback()
      await this.helpers.sleep(500)
      this.service.updateCharacteristic(
        this.C.TargetTemperature,
        this.service.getCharacteristic(this.C.CurrentTemperature).value
      )
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (params.switch || params.mainSwitch) {
        const newState = params.switch || params.mainSwitch
        if (this.cacheOnOff !== newState) {
          this.cacheOnOff = newState
          this.service.updateCharacteristic(this.C.TargetHeatingCoolingState, this.cacheOnOff === 'on' ? 0 : 1)
          this.accessory.historyService.addEntry({
            time: Math.round(new Date().valueOf() / 1000),
            status: this.cacheOnOff === 'on' ? 1 : 0
          })
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current state [%s].', this.dName, this.cacheOnOff)
          }
        }
      }
      const eveLog = {}
      if (this.helpers.hasProperty(params, 'currentTemperature') && params.currentTemperature !== 'unavailable') {
        const currentTemp = parseFloat(params.currentTemperature) + this.tempOffset
        eveLog.temp = currentTemp
        if (this.cacheTemp !== currentTemp) {
          this.cacheTemp = currentTemp
          this.service.updateCharacteristic(this.C.CurrentTemperature, this.cacheTemp)
          this.service.updateCharacteristic(this.C.TargetTemperature, this.cacheTemp)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current temperature [%s].', this.dName, this.cacheTemp)
          }
        }
      }
      if (
        this.helpers.hasProperty(params, 'currentHumidity') &&
        params.currentHumidity !== 'unavailable' &&
        this.service.testCharacteristic(this.C.CurrentRelativeHumidity)
      ) {
        const currentHumi = parseFloat(params.currentHumidity)
        eveLog.humidity = currentHumi
        if (this.cacheHumi !== currentHumi) {
          this.cacheHumi = currentHumi
          this.service.updateCharacteristic(this.C.CurrentRelativeHumidity, this.cacheHumi)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current humidity [%s%].', this.dName, this.cacheHumi)
          }
        }
      }
      if (this.helpers.hasProperty(eveLog, 'temp') || this.helpers.hasProperty(eveLog, 'humidity')) {
        eveLog.time = Math.round(new Date().valueOf() / 1000)
        this.accessory.historyService.addEntry(eveLog)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
