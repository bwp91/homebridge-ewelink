/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceThermostat {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
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
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.thDevices[deviceId]
    this.tempOffset = deviceConf && deviceConf.offset
      ? deviceConf.offset
      : platform.consts.defaultValues.offset
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    /*
      **************
      *** PARAMS ***
      **************
      "volatility": 1, no plan to implement
      "targetTemp": 20, implemented; will set mode in ewelink to C
      "workMode": 1, implemented 1; 1=manual, 2=programmed 3=economical
      "switch": "on", implemented
      "temperature": 29, implemented; F will be converted to C
      "fault": 0, no plan to implemented
      "workState": 2, implemented 1&2; 1=heating, 2=auto
      "tempScale": "c", implemented c; no plan to implement f
      "childLock": "off", no plan to implement
      "mon": "016800c801e0009602b20096032a009603fc00dc05280096", no
      "tues": "016800c801e0009602b20096032a009603fc00dc05280096", plans
      "wed": "016800c801e0009602b20096032a009603fc00dc05280096", to
      "thur": "016800c801e0009602b20096032a009603fc00dc05280096", implement
      "fri": "016800c801e0009602b20096032a009603fc00dc05280096", the
      "sat": "016800c801e000c802b200c8032a00c803fc00c805280096", schedule
      "sun": "016800c801e000c802b200c8032a00c803fc00c805280096", program
    */

    // Add the thermostat service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.Thermostat) ||
      this.accessory.addService(this.hapServ.Thermostat)

    // Set custom properties of the current temperature characteristic
    this.service.getCharacteristic(this.hapChar.CurrentTemperature).setProps({
      minStep: 0.1
    })

    // Add the set handler to the target state characteristic
    this.service.getCharacteristic(this.hapChar.TargetHeatingCoolingState).setProps({
      minValue: 0,
      maxValue: 1,
      validValues: [0, 1]
    })
      .onSet(async value => {
        await this.internalStateUpdate(value)
      })

    // Add the set handler to the target temperature characteristic
    this.service.getCharacteristic(this.hapChar.TargetTemperature).setProps({
      minValue: 5,
      maxValue: 45,
      minStep: 0.5
    })
      .onSet(async value => {
        await this.internalTargetUpdate(value)
      })

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('custom', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        offset: this.tempOffset
      })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async internalStateUpdate (value) {
    try {
      const newValue = value !== 0 ? 'on' : 'off'
      const params = {
        switch: newValue
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (value === 0) {
        this.service.updateCharacteristic(this.hapChar.CurrentHeatingCoolingState, 0)
      }
      this.cacheState = newValue
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s].', this.name, this.messages.curState, this.cacheState)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(
          this.hapChar.TargetHeatingCoolingState,
          this.cacheState === 'on'
        )
      }, 5000)
      throw new this.platform.api.hap.HapStatusError(-70402)
    }
  }

  async internalTargetUpdate (value) {
    try {
      const params = {
        workMode: 1,
        targetTemp: value,
        tempScale: 'c'
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheTarg = value
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s°C].', this.name, this.messages.curTarg, this.cacheTarg)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(
          this.hapChar.TargetHeatingCoolingState,
          this.cacheState === 'on'
        )
      }, 5000)
      throw new this.platform.api.hap.HapStatusError(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (params.switch && params.switch !== this.OnOff) {
        this.cacheState = params.switch
        if (this.cacheState === 'off') {
          this.service.updateCharacteristic(this.hapChar.CurrentHeatingCoolingState, 0)
        }
        this.service.updateCharacteristic(
          this.hapChar.TargetHeatingCoolingState,
          this.cacheState === 'on' ? 1 : 0
        )
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s].', this.name, this.messages.curState, this.cacheState)
        }
      }

      if (params.workState) {
        const workState = params.workState === 1 ? 'on' : 'off'
        if (this.cacheHeat !== workState) {
          this.cacheHeat = workState
          this.service.updateCharacteristic(
            this.hapChar.CurrentHeatingCoolingState,
            this.cacheHeat === 'on' ? 1 : 0
          )
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] %s [%s].', this.name, this.messages.curHeat, this.cacheHeat)
          }
        }
      }

      if (this.funcs.hasProperty(params, 'targetTemp')) {
        const targetTemp = Number(params.targetTemp)
        if (this.cacheTarg !== targetTemp) {
          this.cacheTarg = targetTemp
          this.service.updateCharacteristic(
            this.hapChar.TargetTemperature,
            this.cacheTarg
          )
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] %s [%s°C].', this.name, this.messages.curTarg, this.cacheTarg)
          }
        }
      }

      if (this.funcs.hasProperty(params, 'temperature')) {
        let currentTemp
        if (params.tempScale && params.tempScale === 'f') {
          // Convert to celcius
          currentTemp = (Number(params.temperature) - 32) * 5 / 9

          // Round to nearest 0.5
          currentTemp = Math.round(currentTemp * 2) / 2
        } else {
          currentTemp = Number(params.temperature)
        }
        currentTemp += this.tempOffset
        if (this.cacheTemp !== currentTemp) {
          this.cacheTemp = currentTemp
          this.service.updateCharacteristic(
            this.hapChar.CurrentTemperature,
            this.cacheTemp
          )
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] %s [%s°C].', this.name, this.messages.curTemp, this.cacheTemp)
          }
        }
        this.accessory.eveService.addEntry({ temp: currentTemp })
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
