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
    if (!this.helpers.hasProperty(this.accessory.context, 'cacheHeatingTarget')) {
      this.accessory.context.cacheHeatingTarget = 16
    }
    this.service = this.accessory.getService(this.S.Thermostat) || this.accessory.addService(this.S.Thermostat)
    this.service.getCharacteristic(this.C.CurrentTemperature)
      .setProps({
        minValue: -100,
        minStep: 0.1
      })
    this.service.getCharacteristic(this.C.TargetHeatingCoolingState)
      .on('set', this.internalOnOffUpdate.bind(this))
      .setProps({ validValues: [0, 1] })
    this.service.getCharacteristic(this.C.TargetTemperature)
      .on('set', this.internalTargetTempUpdate.bind(this))
      .setProps({
        minValue: 0,
        maxValue: 30,
        minStep: 0.5
      })
    if (this.accessory.context.sensorType !== 'DS18B20' && !this.service.testCharacteristic(this.C.CurrentRelativeHumidity)) {
      this.service.addCharacteristic(this.C.CurrentRelativeHumidity)
    }

    // *** BETA *** \\
    this.service.updateCharacteristic(this.C.CurrentTemperature, 16)
    this.service.updateCharacteristic(this.C.TargetTemperature, 20)
    // *** END BETA *** \\

    this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
    this.accessory.historyService = new this.platform.eveService('custom', this.accessory, {
      storage: 'fs',
      path: platform.eveLogPath
    })
  }

  async internalOnOffUpdate (value, callback) {
    try {
      callback()
      this.log('[%s] setting TargetHeatingCoolingState to %s.', this.dName, value)
      const params = {}
      if (value === 0) {
        // *** Has been turned off *** \\
        params.mainswitch = 'off'
        params.switch = 'off'
      } else {
        params.mainswitch = 'on'
        params.switch = this.service.getCharacteristic(this.C.CurrentTemperature).value < this.accessory.context.cacheHeatingTarget
          ? 'on'
          : 'off'
      }
      this.cacheOnOff = value !== 0 ? 'on' : 'off'
      this.cacheIsHeating = params.switch
      this.service.updateCharacteristic(this.C.CurrentHeatingCoolingState, this.cacheIsHeating === 'on' ? 1 : 0)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s] heating [%s].', this.dName, this.cacheOnOff, this.cacheIsHeating)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalTargetTempUpdate (value, callback) {
    try {
      this.log('[%s] setting TargetTemperature to %s.', this.dName, value)
      callback()
      this.accessory.context.cacheHeatingTarget = value
      this.cacheOnOff = 'on'
      this.cacheIsHeating = this.service.getCharacteristic(this.C.CurrentTemperature).value < value
        ? 'on'
        : 'off'
      const params = {
        mainswitch: this.cacheOnOff,
        switch: this.cacheIsHeating
      }
      this.service.updateCharacteristic(this.C.CurrentHeatingCoolingState, this.cacheIsHeating === 'on' ? 1 : 0)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s] heating [%s].', this.dName, this.cacheOnOff, this.cacheIsHeating)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalCurrentTempUpdate (value) {
    try {
      const params = {}
      this.log('[%s] internalCurrentTempUpdate() %s.', this.dName, value)
      // *** Logic for checking the new current temperature against the target temperature *** \\
      if (this.service.getCharacteristic(this.C.TargetHeatingCoolingState).value !== 0) {
        // *** Thermostat is on so compare temperatures *** \\
        if (this.cacheTemp < this.accessory.context.cacheHeatingTarget && this.cacheIsHeating !== 'on') {
          this.cacheIsHeating = 'on'
          params.switch = this.cacheIsHeating
          this.service.updateCharacteristic(this.C.CurrentHeatingCoolingState, this.cacheIsHeating === 'on' ? 1 : 0)
          await this.platform.sendDeviceUpdate(this.accessory, params)
        } else if (this.cacheTemp < this.accessory.context.cacheHeatingTarget && this.cacheIsHeating !== 'off') {
          this.cacheIsHeating = 'off'
          params.switch = this.cacheIsHeating
          this.service.updateCharacteristic(this.C.CurrentHeatingCoolingState, this.cacheIsHeating === 'on' ? 1 : 0)
          await this.platform.sendDeviceUpdate(this.accessory, params)
        }
        if (!this.disableDeviceLogging) {
          this.log('[%s] current state [%s] heating [%s].', this.dName, this.cacheOnOff, this.cacheIsHeating)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (params.mainswitch) {
        const newState = params.mainswitch
        if (this.cacheOnOff !== newState) {
          this.cacheOnOff = newState
          this.service.updateCharacteristic(this.C.TargetHeatingCoolingState, this.cacheOnOff === 'on' ? 0 : 1)
          this.accessory.historyService.addEntry({
            time: Math.round(new Date().valueOf() / 1000),
            status: this.cacheOnOff === 'on' ? 1 : 0
          })
          if (this.cacheOnOff === 'off') {
            this.cacheIsHeating = 'off'
          }
          // if (params.updateSource && !this.disableDeviceLogging && !params.switch) {
          if (!this.disableDeviceLogging && !params.switch) {
            this.log('[%s] current state [%s].', this.dName, this.cacheOnOff)
          }
        }
      }
      if (params.switch) {
        // if (params.updateSource && !this.disableDeviceLogging) {
        if (!this.disableDeviceLogging) {
          this.log('[%s] current state [%s] heating [%s].', this.dName, this.cacheOnOff, params.switch)
        }
        this.cacheIsHeating = params.switch
      }
      const eveLog = {}
      if (this.helpers.hasProperty(params, 'currentTemperature') && params.currentTemperature !== 'unavailable') {
        const currentTemp = parseFloat(params.currentTemperature) + this.tempOffset
        eveLog.temp = currentTemp
        if (this.cacheTemp !== currentTemp) {
          this.cacheTemp = currentTemp
          this.service.updateCharacteristic(this.C.CurrentTemperature, this.cacheTemp)
          // if (params.updateSource && !this.disableDeviceLogging) {
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current temperature [%s].', this.dName, this.cacheTemp)
          }
          this.internalCurrentTempUpdate(this.cacheTemp)
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
          // if (params.updateSource && !this.disableDeviceLogging) {
          if (!this.disableDeviceLogging) {
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
