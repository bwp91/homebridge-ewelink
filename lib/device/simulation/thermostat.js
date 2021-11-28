/* jshint node: true, esversion: 10, -W014, -W033 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceThermostat {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.funcs = platform.funcs
    this.hapChar = platform.api.hap.Characteristic
    this.hapErr = platform.api.hap.HapStatusError
    this.hapServ = platform.api.hap.Service
    this.lang = platform.lang
    this.log = platform.log
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Initially set the online flag as true (to be then updated as false if necessary)
    this.isOnline = true

    // Set up custom variables for this device type
    const deviceConf = platform.deviceConf[accessory.context.eweDeviceId]
    this.tempOffset =
      deviceConf && deviceConf.offset ? deviceConf.offset : platform.consts.defaultValues.offset
    this.tempOffsetFactor = deviceConf && deviceConf.offsetFactor
    this.humiOffset =
      deviceConf && deviceConf.humidityOffset
        ? parseInt(deviceConf.humidityOffset)
        : platform.consts.defaultValues.humidityOffset
    this.humiOffsetFactor = deviceConf && deviceConf.humidityOffsetFactor
    this.minTarget =
      deviceConf && deviceConf.minTarget
        ? deviceConf.minTarget
        : platform.consts.defaultValues.minTarget
    this.maxTarget =
      deviceConf && deviceConf.maxTarget
        ? Math.max(deviceConf.maxTarget, this.minTarget + 1)
        : platform.consts.defaultValues.maxTarget

    // Set the correct logging variables for this accessory
    this.enableLogging = !platform.config.disableDeviceLogging
    this.enableDebugLogging = platform.config.debug
    if (deviceConf && deviceConf.overrideLogging) {
      switch (deviceConf.overrideLogging) {
        case 'standard':
          this.enableLogging = true
          this.enableDebugLogging = false
          break
        case 'debug':
          this.enableLogging = true
          this.enableDebugLogging = true
          break
        case 'disable':
          this.enableLogging = false
          this.enableDebugLogging = false
          break
      }
    }

    // If the accessory has a switch service then remove it
    if (this.accessory.getService(this.hapServ.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
    }

    // If the accessory has a temperature sensor service then remove it
    if (this.accessory.getService(this.hapServ.TemperatureSensor)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.TemperatureSensor))
    }

    // Set up the accessory with default target temp when added the first time
    if (!this.funcs.hasProperty(this.accessory.context, 'cacheTarget')) {
      this.accessory.context.cacheTarget = 20
    }

    // If the accessory has a heater service then remove it
    if (this.accessory.getService(this.hapServ.HeaterCooler)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.HeaterCooler))
    }

    // If the accessory has a humidifier service then remove it
    if (this.accessory.getService(this.hapServ.HumidifierDehumidifier)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.HumidifierDehumidifier))
    }

    // If the accessory has a humidity sensor service then remove it
    if (this.accessory.getService(this.hapServ.HumiditySensor)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.HumiditySensor))
    }

    // Add the thermostat service if it doesn't already exist
    this.service =
      this.accessory.getService(this.hapServ.Thermostat) ||
      this.accessory.addService(this.hapServ.Thermostat)

    // The DS18B20 sensor does not provide humidity readings
    if (this.accessory.context.sensorType === 'DS18B20') {
      if (this.service.testCharacteristic(this.hapChar.CurrentRelativeHumidity)) {
        this.service.removeCharacteristic(
          this.service.getCharacteristic(this.hapChar.CurrentRelativeHumidity)
        )
      }
    } else {
      if (!this.service.testCharacteristic(this.hapChar.CurrentRelativeHumidity)) {
        this.service.addCharacteristic(this.hapChar.CurrentRelativeHumidity)
      }
      this.humiService = true
    }

    // Set custom properties of the current temperature characteristic
    this.service.getCharacteristic(this.hapChar.CurrentTemperature).setProps({
      minStep: 0.1
    })

    // Add options to the target state characteristic
    this.service
      .getCharacteristic(this.hapChar.TargetHeatingCoolingState)
      .setProps({
        validValues: [0, 3]
      })
      .onSet(async value => await this.internalStateUpdate(value))

    // Add the set handler to the target temperature characteristic
    this.service
      .getCharacteristic(this.hapChar.TargetTemperature)
      .updateValue(this.accessory.context.cacheTarget)
      .setProps({
        minValue: this.minTarget,
        maxValue: this.maxTarget,
        minStep: 0.5
      })
      .onSet(async value => await this.internalTargetTempUpdate(value))

    // Add the get handlers only if the user hasn't disabled the disableNoResponse setting
    if (!platform.config.disableNoResponse) {
      this.service.getCharacteristic(this.hapChar.CurrentTemperature).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.CurrentTemperature).value
      })
      this.service.getCharacteristic(this.hapChar.TargetHeatingCoolingState).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.TargetHeatingCoolingState).value
      })
      this.service.getCharacteristic(this.hapChar.CurrentHeatingCoolingState).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.CurrentHeatingCoolingState).value
      })
      this.service.getCharacteristic(this.hapChar.TargetTemperature).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.TargetTemperature).value
      })
    }

    // Initialise these caches now since they aren't determined by the initial externalUpdate()
    this.cacheState =
      this.service.getCharacteristic(this.hapChar.TargetHeatingCoolingState).value === 3
        ? 'on'
        : 'off'
    this.cacheHeat =
      this.cacheState === 'on' &&
      this.service.getCharacteristic(this.hapChar.TargetTemperature).value >
        this.service.getCharacteristic(this.hapChar.CurrentTemperature).value
        ? 'on'
        : 'off'

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('custom', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Set up an interval to get eWeLink to send regular temperature/humidity updates
    if (platform.config.mode !== 'lan') {
      setTimeout(() => {
        this.internalUIUpdate()
        this.intervalPoll = setInterval(() => this.internalUIUpdate(), 120000)
      }, 5000)

      // Stop the intervals on Homebridge shutdown
      platform.api.on('shutdown', () => {
        clearInterval(this.intervalPoll)
      })
    }

    // Output the customised options to the log
    const opts = JSON.stringify({
      humidityOffset: this.humiOffset,
      humidityOffsetFactor: this.humiOffsetFactor,
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable',
      maxTarget: this.maxTarget,
      minTarget: this.minTarget,
      offset: this.tempOffset,
      offsetFactor: this.tempOffsetFactor,
      showAs: 'heater'
    })
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
  }

  async internalStateUpdate (value) {
    try {
      const params = { deviceType: 'normal' }
      let newState
      let newHeat
      if (value === 0) {
        params.mainSwitch = 'off'
        params.switch = 'off'
        newState = 'off'
        newHeat = 'off'
      } else {
        if (this.cacheTemp < this.accessory.context.cacheTarget) {
          params.mainSwitch = 'on'
          params.switch = 'on'
          newState = 'on'
          newHeat = 'on'
        } else {
          params.mainSwitch = 'off'
          params.switch = 'off'
          newState = 'on'
          newHeat = 'off'
        }
      }

      // Only send the update if either:
      // * The new value (state) is OFF and the cacheHeat was ON
      // * The new value (state) is ON and newHeat is 'on'
      if ((value === 0 && this.cacheHeat === 'on') || (value === 3 && newHeat === 'on')) {
        await this.platform.sendDeviceUpdate(this.accessory, params)
      }
      if (newState !== this.cacheState) {
        this.cacheState = newState
        if (this.enableLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
        }
      }
      if (newHeat !== this.cacheHeat) {
        this.cacheHeat = newHeat
        if (this.enableLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curHeat, this.cacheHeat)
        }
      }
      this.service.updateCharacteristic(
        this.hapChar.CurrentHeatingCoolingState,
        value === 3 ? 1 : 0
      )
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(
          this.hapChar.TargetHeatingCoolingState,
          this.cacheState === 'on' ? 3 : 0
        )
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async internalTargetTempUpdate (value) {
    try {
      if (value === this.accessory.context.cacheTarget) {
        return
      }
      this.accessory.context.cacheTarget = value
      if (this.enableLogging) {
        this.log('[%s] %s [%s°C].', this.name, this.lang.curTarg, value)
      }
      if (this.cacheState === 'off') {
        return
      }
      const params = { deviceType: 'normal' }
      let newHeat
      if (this.cacheTemp < value) {
        params.mainSwitch = 'on'
        params.switch = 'on'
        newHeat = 'on'
      } else {
        params.mainSwitch = 'off'
        params.switch = 'off'
        newHeat = 'off'
      }
      if (newHeat === this.cacheHeat) {
        return
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheHeat = newHeat
      if (this.enableLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curHeat, this.cacheHeat)
      }
      this.service.updateCharacteristic(
        this.hapChar.CurrentHeatingCoolingState,
        this.cacheHeat === 'on' ? 1 : 0
      )
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(
          this.hapChar.TargetTemperature,
          this.accessory.context.cacheTarget
        )
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async internalCurrentTempUpdate () {
    try {
      if (this.cacheState === 'off') {
        return
      }
      const params = { deviceType: 'normal' }
      let newHeat
      if (this.cacheTemp < this.accessory.context.cacheTarget) {
        params.mainSwitch = 'on'
        params.switch = 'on'
        newHeat = 'on'
      } else {
        params.mainSwitch = 'off'
        params.switch = 'off'
        newHeat = 'off'
      }
      if (newHeat === this.cacheHeat) {
        return
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheHeat = newHeat
      if (this.enableLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curHeat, this.cacheHeat)
      }
      this.service.updateCharacteristic(
        this.hapChar.CurrentHeatingCoolingState,
        this.cacheHeat === 'on' ? 1 : 0
      )
    } catch (err) {
      // Suppress errors here
    }
  }

  async internalUIUpdate () {
    try {
      // Skip polling if device isn't online
      if (!this.isOnline) {
        return
      }

      // Send the params to request the updates
      await this.platform.sendDeviceUpdate(this.accessory, { uiActive: 120 })
    } catch (err) {
      // Suppress errors here
    }
  }

  async externalUpdate (params) {
    try {
      if (
        this.funcs.hasProperty(params, 'currentTemperature') &&
        params.currentTemperature !== 'unavailable'
      ) {
        let newTemp = Number(params.currentTemperature)
        if (this.tempOffsetFactor) {
          newTemp *= this.tempOffset
        } else {
          newTemp += this.tempOffset
        }
        if (newTemp !== this.cacheTemp) {
          this.cacheTemp = newTemp
          this.service.updateCharacteristic(this.hapChar.CurrentTemperature, this.cacheTemp)
          this.accessory.eveService.addEntry({ temp: this.cacheTemp })
          if (params.updateSource && this.enableLogging) {
            this.log('[%s] %s [%s°C].', this.name, this.lang.curTemp, this.cacheTemp)
          }
          await this.internalCurrentTempUpdate()
        }
      }
      if (
        this.funcs.hasProperty(params, 'currentHumidity') &&
        params.currentHumidity !== 'unavailable' &&
        this.humiService
      ) {
        let newHumi = parseInt(params.currentHumidity)
        if (this.humiOffsetFactor) {
          newHumi *= this.humiOffset
        } else {
          newHumi += this.humiOffset
        }
        newHumi = Math.max(Math.min(parseInt(newHumi), 100), 0)
        if (newHumi !== this.cacheHumi) {
          this.cacheHumi = newHumi
          this.service.updateCharacteristic(this.hapChar.CurrentRelativeHumidity, this.cacheHumi)
          this.accessory.eveService.addEntry({ humidity: this.cacheHumi })
          if (params.updateSource && this.enableLogging) {
            this.log('[%s] %s [%s%].', this.name, this.lang.curHumi, this.cacheHumi)
          }
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
