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

    // Set up custom variables for this device type
    const eweId = this.accessory.context.eweDeviceId
    this.tempOffset = Number(platform.thTempOffset[eweId] || 0)
    this.hideSwitch = this.platform.config.hideSwitchFromTH.includes(eweId)

    // If the accessory has a thermostat service then remove it
    if (this.accessory.getService(this.hapServ.Thermostat)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Thermostat))
    }

    // The user can choose to hide the switch service if they desire
    if (this.platform.config.hideSwitchFromTH.includes(eweId)) {
      // User has hidden the switch service so remove it if it exists
      if (this.accessory.getService(this.hapServ.Switch)) {
        this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
      }
    } else {
      // User has not hidden the switch service so add it if it doesn't already exist
      this.switchService = this.accessory.getService(this.hapServ.Switch) ||
        this.accessory.addService(this.hapServ.Switch)

      // Add the set handler to the switch on/off characteristic
      this.switchService.getCharacteristic(this.hapChar.On)
        .on('set', this.internalUpdate.bind(this))
    }

    // Add the temperature sensor service if it doesn't already exist
    this.tempService = this.accessory.getService(this.hapServ.TemperatureSensor) ||
      this.accessory.addService(this.hapServ.TemperatureSensor)

    // Set custom properties of the current temperature characteristic
    this.tempService.getCharacteristic(this.hapChar.CurrentTemperature).setProps({
      minValue: -100,
      minStep: 0.1
    })

    // The DS18B20 sensor does not provide humidity readings
    if (this.accessory.context.sensorType !== 'DS18B20') {
      // Add the humidity sensor service if it doesn't already exist
      this.humiService = this.accessory.getService(this.hapServ.HumiditySensor) ||
        this.accessory.addService(this.hapServ.HumiditySensor)
    }

    // The switch as the primary service ensures the status is reflected in the Home icon
    if (this.switchService) {
      this.switchService.setPrimaryService()
    }

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('custom', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
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
          this.accessory.eveService.addEntry({ status: this.cacheOnOff === 'on' ? 1 : 0 })
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
        this.accessory.eveService.addEntry(eveLog)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
