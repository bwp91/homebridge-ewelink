/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceThermostat {
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

    this.tempOffset = parseFloat(platform.thTempOffset[this.accessory.context.eweDeviceId] || 0)
    if (this.accessory.getService(this.hapServ.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
    }
    if (this.accessory.getService(this.hapServ.TemperatureSensor)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.TemperatureSensor))
    }
    if (this.accessory.getService(this.hapServ.HumiditySensor)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.HumiditySensor))
    }
    if (!this.funcs.hasProperty(this.accessory.context, 'cacheTarget')) {
      this.accessory.context.cacheTarget = 20
    }
    this.service = this.accessory.getService(this.hapServ.Thermostat) || this.accessory.addService(this.hapServ.Thermostat)
    this.service.getCharacteristic(this.hapChar.CurrentTemperature)
      .setProps({
        minValue: -100,
        minStep: 0.1
      })
    this.service.getCharacteristic(this.hapChar.TargetHeatingCoolingState)
      .on('set', this.internalOnOffUpdate.bind(this))
      .setProps({ validValues: [0, 1] })
    this.service.getCharacteristic(this.hapChar.TargetTemperature)
      .on('set', this.internalTargetTempUpdate.bind(this))
      .setProps({
        minValue: 0,
        maxValue: 30,
        minStep: 0.5
      })
    if (this.accessory.context.sensorType !== 'DS18B20' && !this.service.testCharacteristic(this.hapChar.CurrentRelativeHumidity)) {
      this.service.addCharacteristic(this.hapChar.CurrentRelativeHumidity)
    }

    /*
    The eWeLink app seems a little confusing with only options for
      - if temp is HIGHER THAN    eg 20.0 TURN ON/OFF
      - if temp is LOWER THAN     eg 20.0 TURN ON/OFF
    There doesn't seem to be an option for IS EQUAL TO but I assume the ON/OFF doesn't change from the previous state

    The payload for automatic mode is as follows:

    "deviceType": "temperature",
    "targets": [
      {
        "targetHigh": "19.6",
        "reaction": {
          "switch": "off"
        }
      },
      {
        "targetLow": "19.6",
        "reaction": {
          "switch": "on"
        }
      }
    ]
    */

    this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
    this.accessory.historyService = new this.platform.eveService('custom', this.accessory, {
      storage: 'fs',
      path: platform.eveLogPath
    })

    // *** Setting this already makes the plugin send the payload to setup as thermostat *** \\
    this.service.setCharacteristic(this.hapChar.TargetTemperature, this.accessory.context.cacheTarget)
  }

  async internalOnOffUpdate (value, callback) {
    try {
      callback()
      const params = {}
      if (value === 0) {
        params.mainSwitch = 'off'
        params.switch = 'off'
      } else {
        params.mainSwitch = 'on'
      }
      this.cacheOnOff = value !== 0 ? 'on' : 'off'
      const currentTemp = this.service.getCharacteristic(this.hapChar.CurrentTemperature).value
      this.cacheHeating = this.cacheOnOff === 'on' && currentTemp < this.accessory.context.cacheTarget
        ? 'on'
        : 'off'
      this.service.updateCharacteristic(this.hapChar.CurrentHeatingCoolingState, this.cacheHeating === 'on' ? 1 : 0)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s] heating [%s].', this.name, this.cacheOnOff, this.cacheHeating)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalTargetTempUpdate (value, callback) {
    try {
      callback()
      this.accessory.context.cacheTarget = value
      this.cacheOnOff = 'on'
      this.cacheHeating = this.service.getCharacteristic(this.hapChar.CurrentTemperature).value < value
        ? 'on'
        : 'off'
      const params = {
        deviceType: 'temperature',
        targets: [
          {
            targetHigh: value.toFixed(1),
            reaction: {
              switch: 'off'
            }
          },
          {
            targetLow: value.toFixed(1),
            reaction: {
              switch: 'on'
            }
          }
        ]
      }
      this.service.updateCharacteristic(this.hapChar.CurrentHeatingCoolingState, this.cacheHeating === 'on' ? 1 : 0)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s] heating [%s].', this.name, this.cacheOnOff, this.cacheHeating)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (params.mainSwitch) {
        const newState = params.mainSwitch
        if (this.cacheOnOff !== newState) {
          this.cacheOnOff = newState
          this.service.updateCharacteristic(this.hapChar.TargetHeatingCoolingState, this.cacheOnOff === 'on' ? 1 : 0)
          this.accessory.historyService.addEntry({
            time: Math.round(new Date().valueOf() / 1000),
            status: this.cacheOnOff === 'on' ? 1 : 0
          })
          if (this.cacheOnOff === 'off') {
            this.cacheHeating = 'off'
          }
          if (params.updateSource && !this.disableDeviceLogging && !params.switch) {
            this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
          }
        }
      }
      if (params.switch && params.switch !== this.cacheHeating) {
        this.cacheHeating = params.switch
        this.service.updateCharacteristic(this.hapChar.CurrentHeatingCoolingState, params.switch === 'on' ? 1 : 0)
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s] heating [%s].', this.name, this.cacheOnOff, params.switch)
        }
      }
      const eveLog = {}
      if (this.funcs.hasProperty(params, 'currentTemperature') && params.currentTemperature !== 'unavailable') {
        const currentTemp = Number(params.currentTemperature) + this.tempOffset
        eveLog.temp = currentTemp
        if (this.cacheTemp !== currentTemp) {
          this.cacheTemp = currentTemp
          this.service.updateCharacteristic(this.hapChar.CurrentTemperature, this.cacheTemp)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current temperature [%s°C].', this.name, this.cacheTemp)
          }
        }
      }
      if (
        this.funcs.hasProperty(params, 'currentHumidity') &&
        params.currentHumidity !== 'unavailable' &&
        this.service.testCharacteristic(this.hapChar.CurrentRelativeHumidity)
      ) {
        const currentHumi = parseInt(params.currentHumidity)
        eveLog.humidity = currentHumi
        if (this.cacheHumi !== currentHumi) {
          this.cacheHumi = currentHumi
          this.service.updateCharacteristic(this.hapChar.CurrentRelativeHumidity, this.cacheHumi)
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
