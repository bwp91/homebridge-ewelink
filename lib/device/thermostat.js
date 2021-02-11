/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceThermostat {
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

    /*
      **************
      *** PARAMS ***
      **************
      "volatility": 1, // Deviation
      "targetTemp": 20, // C or F In 0.5
      "workMode": 1, // 1=manual, 2=programmed 3=economical
      "switch": "on",
      "temperature": 29, // C or F In 0.5
      "fault": 0, // Not Sure
      "workState": 2, // 1=heating, 2=auto
      "tempScale": "c", // guessing "f"
      "childLock": "off", // Guessing "on"
      "mon": "016800c801e0009602b20096032a009603fc00dc05280096",
      "tues": "016800c801e0009602b20096032a009603fc00dc05280096",
      "wed": "016800c801e0009602b20096032a009603fc00dc05280096",
      "thur": "016800c801e0009602b20096032a009603fc00dc05280096",
      "fri": "016800c801e0009602b20096032a009603fc00dc05280096",
      "sat": "016800c801e000c802b200c8032a00c803fc00c805280096",
      "sun": "016800c801e000c802b200c8032a00c803fc00c805280096",
    */

    // Add the thermostat service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.Thermostat) ||
      this.accessory.addService(this.hapServ.Thermostat)

    // Set custom properties of the current temperature characteristic
    this.service.getCharacteristic(this.hapChar.CurrentTemperature).setProps({
      minValue: -100,
      minStep: 0.1
    })

    // Add the set handler to the target state characteristic
    this.service.getCharacteristic(this.hapChar.TargetHeatingCoolingState)
      .on('set', this.internalOnOffUpdate.bind(this))
      .setProps({
        minValue: 0,
        maxValue: 1,
        validValues: [0, 1]
      })

    // Add the set handler to the target temperature characteristic
    this.service.getCharacteristic(this.hapChar.TargetTemperature)
      .on('set', this.internalTargetTempUpdate.bind(this))
      .setProps({
        minValue: 5,
        maxValue: 45,
        minStep: 0.5
      })

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('custom', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })
  }

  async internalOnOffUpdate (value, callback) {
    try {
      callback()
      this.cacheOnOff = value !== 0 ? 'on' : 'off'
      const params = {
        switch: this.cacheOnOff
      }
      if (value === 0) {
        this.service.updateCharacteristic(this.hapChar.CurrentHeatingCoolingState, 0)
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalTargetTempUpdate (value, callback) {
    try {
      callback()
      this.cacheTarget = value
      const params = {
        workMode: 1,
        targetTemp: this.cacheTarget
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current target [%s°C].', this.name, this.cacheTarget)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (params.switch && params.switch !== this.OnOff) {
        this.cacheOnOff = params.switch
        if (this.cacheOnOff === 'off') {
          this.service.updateCharacteristic(this.hapChar.CurrentHeatingCoolingState, 0)
        }
        this.service.updateCharacteristic(
          this.hapChar.TargetHeatingCoolingState,
          this.cacheOnOff === 'on' ? 1 : 0
        )
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
        }
      }

      if (params.workState) {
        const workState = params.workState === 1 ? 'on' : 'off'
        if (this.cacheHeating !== workState) {
          this.cacheHeating = workState
          this.service.updateCharacteristic(
            this.hapChar.CurrentHeatingCoolingState,
            this.cacheHeating === 'on' ? 1 : 0
          )
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current heating [%s].', this.name, this.cacheHeating)
          }
        }
      }

      if (this.funcs.hasProperty(params, 'targetTemp')) {
        const targetTemp = Number(params.targetTemp)
        if (this.cacheTarget !== targetTemp) {
          this.cacheTarget = targetTemp
          this.service.updateCharacteristic(
            this.hapChar.TargetTemperature,
            this.cacheTarget
          )
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current target [%s°C].', this.name, this.cacheTarget)
          }
        }
      }

      if (this.funcs.hasProperty(params, 'temperature')) {
        const currentTemp = Number(params.temperature) + this.tempOffset
        if (this.cacheTemp !== currentTemp) {
          this.cacheTemp = currentTemp
          this.service.updateCharacteristic(
            this.hapChar.CurrentTemperature,
            this.cacheTemp
          )
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current temperature [%s°C].', this.name, this.cacheTemp)
          }
        }
        this.accessory.eveService.addEntry({ temp: currentTemp })
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
