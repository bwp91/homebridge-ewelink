/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSensorAmbient {
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

    this.tempOffset = parseFloat(platform.thTempOffset[this.accessory.context.eweDeviceId] || 0)
    this.hideSwitch = (this.platform.config.hideSwitchFromTH || '').split(',').includes(this.accessory.context.eweDeviceId)
    if (this.accessory.getService(this.hapServ.Thermostat)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Thermostat))
    }
    if ((this.platform.config.hideSwitchFromTH || '').split(',').includes(this.accessory.context.eweDeviceId)) {
      if (this.accessory.getService(this.hapServ.Switch)) {
        this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
      }
    } else {
      this.switchService = this.accessory.getService(this.hapServ.Switch) || this.accessory.addService(this.hapServ.Switch)
      this.switchService.getCharacteristic(this.hapChar.On)
        .on('set', this.internalUpdate.bind(this))
    }
    this.tempService = this.accessory.getService(this.hapServ.TemperatureSensor) || this.accessory.addService(this.hapServ.TemperatureSensor)
    this.tempService.getCharacteristic(this.hapChar.CurrentTemperature)
      .setProps({
        minValue: -100,
        minStep: 0.1
      })
    if (this.accessory.context.sensorType !== 'DS18B20') {
      this.humiService = this.accessory.getService(this.hapServ.HumiditySensor) || this.accessory.addService(this.hapServ.HumiditySensor)
    }
    if (this.switchService) {
      this.switchService.setPrimaryService()
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
        this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
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
          this.switchService.updateCharacteristic(this.hapChar.On, this.cacheOnOff === 'on')
          this.accessory.historyService.addEntry({
            time: Math.round(new Date().valueOf() / 1000),
            status: this.cacheOnOff === 'on' ? 1 : 0
          })
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
          }
        }
      }
      const eveLog = {}
      if (this.funcs.hasProperty(params, 'currentTemperature') && params.currentTemperature !== 'unavailable') {
        const currentTemp = Number(params.currentTemperature) + this.tempOffset
        eveLog.temp = currentTemp
        if (this.cacheTemp !== currentTemp) {
          this.cacheTemp = currentTemp
          this.tempService.updateCharacteristic(this.hapChar.CurrentTemperature, this.cacheTemp)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current temperature [%s°C].', this.name, this.cacheTemp)
          }
        }
      }
      if (this.funcs.hasProperty(params, 'currentHumidity') && params.currentHumidity !== 'unavailable' && this.humiService) {
        const currentHumi = parseInt(params.currentHumidity)
        eveLog.humidity = currentHumi
        if (this.cacheHumi !== currentHumi) {
          this.cacheHumi = currentHumi
          this.humiService.updateCharacteristic(this.hapChar.CurrentRelativeHumidity, this.cacheHumi)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current humidity [%s%].', this.name, this.cacheHumi)
          }
        }
      }
      if (this.funcs.hasProperty(eveLog, 'temp') || this.funcs.hasProperty(eveLog, 'humidity')) {
        eveLog.time = Math.round(new Date().valueOf() / 1000)
        this.accessory.historyService.addEntry(eveLog)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
