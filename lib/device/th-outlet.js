/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceTHOutlet {
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
    this.hideSwitch = (this.platform.config.hideSwitchFromTH || '').split(',').includes(this.accessory.context.eweDeviceId)
    if (this.accessory.getService(this.S.Thermostat)) {
      this.accessory.removeService(this.accessory.getService(this.S.Thermostat))
    }
    if ((this.platform.config.hideSwitchFromTH || '').split(',').includes(this.accessory.context.eweDeviceId)) {
      if (this.accessory.getService(this.S.Switch)) {
        this.accessory.removeService(this.accessory.getService(this.S.Switch))
      }
    } else {
      this.switchService = this.accessory.getService(this.S.Switch) || this.accessory.addService(this.S.Switch)
      this.switchService.getCharacteristic(this.C.On)
        .on('set', this.internalUpdate.bind(this))
    }
    this.tempService = this.accessory.getService(this.S.TemperatureSensor) || this.accessory.addService(this.S.TemperatureSensor)
    this.tempService.getCharacteristic(this.C.CurrentTemperature)
      .setProps({
        minValue: -100,
        minStep: 0.1
      })
    if (this.accessory.context.sensorType !== 'DS18B20') {
      this.humiService = this.accessory.getService(this.S.HumiditySensor) || this.accessory.addService(this.S.HumiditySensor)
    }
    this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
    this.accessory.historyService = new this.platform.eveService('custom', this.accessory, {
      storage: 'fs',
      path: platform.eveLogPath
    })
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      const params = {
        switch: value ? 'on' : 'off'
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheOnOff = value ? 'on' : 'off'
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.dName, this.cacheOnOff)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!this.hideSwitch && params.switch) {
        const newState = params.switch
        if (this.cacheOnOff !== newState) {
          this.cacheOnOff = newState
          this.switchService.updateCharacteristic(this.C.On, this.cacheOnOff === 'on')
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
        const currentTemp = (parseFloat(params.currentTemperature) + this.tempOffset).toFixed(1)
        eveLog.temp = currentTemp
        if (this.cacheTemp !== currentTemp) {
          this.cacheTemp = currentTemp
          this.tempService.updateCharacteristic(this.C.CurrentTemperature, this.cacheTemp)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current temperature [%s].', this.dName, this.cacheTemp)
          }
        }
      }
      if (this.helpers.hasProperty(params, 'currentHumidity') && params.currentHumidity !== 'unavailable' && this.humiService) {
        const currentHumi = parseInt(params.currentHumidity)
        eveLog.humidity = currentHumi
        if (this.cacheHumi !== currentHumi) {
          this.cacheHumi = currentHumi
          this.humiService.updateCharacteristic(this.C.CurrentRelativeHumidity, this.cacheHumi)
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
