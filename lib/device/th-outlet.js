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
    this.tempOffset = parseFloat(platform.thTempOffset[accessory.context.eweDeviceId] || 0)
    this.hideSwitch = (this.platform.config.hideSwitchFromTH || '').split(',').includes(accessory.context.eweDeviceId)
    if (accessory.getService(this.S.Thermostat)) {
      accessory.removeService(accessory.getService(this.S.Thermostat))
    }
    if ((this.platform.config.hideSwitchFromTH || '').split(',').includes(accessory.context.eweDeviceId)) {
      if (accessory.getService(this.S.Switch)) {
        accessory.removeService(accessory.getService(this.S.Switch))
      }
    } else {
      this.switchService = accessory.getService(this.S.Switch) || accessory.addService(this.S.Switch)
      this.switchService.getCharacteristic(this.C.On)
        .on('set', this.internalUpdate.bind(this))
    }
    this.tempService = accessory.getService(this.S.TemperatureSensor) || accessory.addService(this.S.TemperatureSensor)
    this.tempService.getCharacteristic(this.C.CurrentTemperature)
      .setProps({ minValue: -100 })
    if (accessory.context.sensorType !== 'DS18B20') {
      this.humiService = accessory.getService(this.S.HumiditySensor) || accessory.addService(this.S.HumiditySensor)
    }
    accessory.log = platform.config.debugFakegato ? this.log : () => {}
    accessory.historyService = new this.platform.eveService('custom', accessory, {
      storage: 'fs',
      path: platform.eveLogPath
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
      this.cacheOnOff = value ? 'on' : 'off'
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.accessory.displayName, this.cacheOnOff)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!this.hideSwitch && (params.switch || params.mainSwitch)) {
        const newState = params.switch || params.mainSwitch
        if (this.cacheOnOff !== newState) {
          this.cacheOnOff = newState
          this.switchService.updateCharacteristic(this.C.On, this.cacheOnOff === 'on')
          this.accessory.historyService.addEntry({
            time: Math.round(new Date().valueOf() / 1000),
            status: this.cacheOnOff === 'on' ? 1 : 0
          })
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current state [%s].', this.accessory.displayName, this.cacheOnOff)
          }
        }
      }
      const eveLog = {}
      if (this.helpers.hasProperty(params, 'currentTemperature') && params.currentTemperature !== 'unavailable') {
        const currentTemp = parseFloat(params.currentTemperature) + this.tempOffset
        eveLog.temp = currentTemp
        if (this.cacheTemp !== currentTemp) {
          this.cacheTemp = currentTemp
          this.tempService.updateCharacteristic(this.C.CurrentTemperature, this.cacheTemp)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current temperature [%s].', this.accessory.displayName, this.cacheTemp)
          }
        }
      }
      if (this.helpers.hasProperty(params, 'currentHumidity') && params.currentHumidity !== 'unavailable' && this.humiService) {
        const currentHumi = parseFloat(params.currentHumidity)
        eveLog.humidity = currentHumi
        if (this.cacheHumi !== currentHumi) {
          this.cacheHumi = currentHumi
          this.humiService.updateCharacteristic(this.C.CurrentRelativeHumidity, this.cacheHumi)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current humidity [%s%].', this.accessory.displayName, this.cacheHumi)
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
