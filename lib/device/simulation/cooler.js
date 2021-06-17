/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceHeater {
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

    // Set up custom variables for this device type
    const deviceConf = platform.thDevices[accessory.context.eweDeviceId]
    const deviceConf2 = platform.simulations[accessory.context.eweDeviceId]
    this.tempOffset =
      deviceConf && deviceConf.offset ? deviceConf.offset : platform.consts.defaultValues.offset
    this.humiOffset =
      deviceConf && deviceConf.humidityOffset
        ? deviceConf.humidityOffset
        : platform.consts.defaultValues.humidityOffset
    this.minTarget =
      deviceConf && deviceConf.minTarget
        ? deviceConf.minTarget
        : platform.consts.defaultValues.minTarget
    this.maxTarget =
      deviceConf && deviceConf.maxTarget
        ? Math.max(deviceConf.maxTarget, this.minTarget + 1)
        : platform.consts.defaultValues.maxTarget
    this.disableDeviceLogging =
      (deviceConf && deviceConf.overrideDisabledLogging) || deviceConf2.overrideDisabledLogging
        ? false
        : platform.config.disableDeviceLogging

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

    // Check to make sure user has not switched from heater to cooler
    if (this.accessory.context.cacheType !== 'cooler') {
      // Remove and re-setup as a HeaterCooler
      if (this.accessory.getService(this.hapServ.HeaterCooler)) {
        this.accessory.removeService(this.accessory.getService(this.hapServ.HeaterCooler))
      }
      this.accessory.context.cacheType = 'cooler'
      this.accessory.context.cacheTarget = 20
    }

    // If the accessory has a thermostat service then remove it
    if (this.accessory.getService(this.hapServ.Thermostat)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Thermostat))
    }

    // If the accessory has a humidifier service then remove it
    if (this.accessory.getService(this.hapServ.HumidifierDehumidifier)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.HumidifierDehumidifier))
    }

    // If the accessory has a temperature sensor service then remove it
    if (this.accessory.getService(this.hapServ.TemperatureSensor)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.TemperatureSensor))
    }

    // Add the heater service if it doesn't already exist
    this.service =
      this.accessory.getService(this.hapServ.HeaterCooler) ||
      this.accessory.addService(this.hapServ.HeaterCooler)

    // The DS18B20 sensor does not provide humidity readings
    if (this.accessory.context.sensorType === 'DS18B20') {
      if (this.accessory.getService(this.hapServ.HumiditySensor)) {
        this.accessory.removeService(this.accessory.getService(this.hapServ.HumiditySensor))
      }
    } else {
      // Add the humidity sensor service if it doesn't already exist
      this.humiService =
        this.accessory.getService(this.hapServ.HumiditySensor) ||
        this.accessory.addService(this.hapServ.HumiditySensor)
    }

    // Set the heater as the primary service
    this.service.setPrimaryService()

    // Set custom properties of the current temperature characteristic
    this.service.getCharacteristic(this.hapChar.CurrentTemperature).setProps({
      minStep: 0.1
    })

    // Add the set handler to the heater active characteristic
    this.service.getCharacteristic(this.hapChar.Active).onSet(async value => {
      await this.internalStateUpdate(value)
    })

    // Add options to the target state characteristic
    this.service.getCharacteristic(this.hapChar.TargetHeaterCoolerState).setProps({
      minValue: 0,
      maxValue: 0,
      validValues: [0]
    })

    // Add the set handler to the target temperature characteristic
    this.service
      .getCharacteristic(this.hapChar.CoolingThresholdTemperature)
      .updateValue(this.accessory.context.cacheTarget)
      .setProps({
        minValue: this.minTarget,
        maxValue: this.maxTarget,
        minStep: 0.5
      })
      .onSet(async value => {
        await this.internalTargetTempUpdate(value)
      })

    // Initialise these caches now since they aren't determined by the initial externalUpdate()
    this.cacheState = this.service.getCharacteristic(this.hapChar.Active).value === 1 ? 'on' : 'off'
    this.cacheCool =
      this.cacheState === 'on' &&
      this.service.getCharacteristic(this.hapChar.TargetHeaterCoolerState).value === 3
        ? 'on'
        : 'off'

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('custom', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Set up an interval to get eWeLink to send regular temperature/humidity updates
    setTimeout(() => {
      this.internalUIUpdate()
      this.intervalPoll = setInterval(() => this.internalUIUpdate(), 120000)
    }, 5000)

    // Stop the intervals on Homebridge shutdown
    platform.api.on('shutdown', () => {
      clearInterval(this.intervalPoll)
    })

    // Output the customised options to the log if in debug mode
    if (platform.config.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        humidityOffset: this.humiOffset,
        maxTarget: this.maxTarget,
        minTarget: this.minTarget,
        offset: this.tempOffset,
        type: deviceConf2.type
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async internalStateUpdate (value) {
    try {
      const params = { deviceType: 'normal' }
      let newState
      let newCool
      if (value === 0) {
        params.mainSwitch = 'off'
        params.switch = 'off'
        newState = 'off'
        newCool = 'off'
      } else {
        if (this.cacheTemp > this.accessory.context.cacheTarget) {
          params.mainSwitch = 'on'
          params.switch = 'on'
          newState = 'on'
          newCool = 'on'
        } else {
          params.mainSwitch = 'off'
          params.switch = 'off'
          newState = 'on'
          newCool = 'off'
        }
      }

      // Only send the update if either:
      // * The new value (state) is OFF and the cacheCool was ON
      // * The new value (state) is ON and newCool is 'on'
      if ((value === 0 && this.cacheCool === 'on') || (value === 1 && newCool === 'on')) {
        await this.platform.sendDeviceUpdate(this.accessory, params)
      }
      if (newState !== this.cacheState) {
        this.cacheState = newState
        if (!this.disableDeviceLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
        }
      }
      if (newCool !== this.cacheCool) {
        this.cacheCool = newCool
        if (!this.disableDeviceLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curCool, this.cacheCool)
        }
      }
      this.service.updateCharacteristic(
        this.hapChar.CurrentHeaterCoolerState,
        value === 1 ? (this.cacheCool === 'on' ? 3 : 1) : 0
      )
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0)
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
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s°C].', this.name, this.lang.curTarg, value)
      }
      if (this.cacheState === 'off') {
        return
      }
      const params = { deviceType: 'normal' }
      let newCool
      if (this.cacheTemp > value) {
        params.mainSwitch = 'on'
        params.switch = 'on'
        newCool = 'on'
      } else {
        params.mainSwitch = 'off'
        params.switch = 'off'
        newCool = 'off'
      }
      if (newCool === this.cacheCool) {
        return
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheCool = newCool
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curCool, this.cacheCool)
      }
      this.service.updateCharacteristic(
        this.hapChar.CurrentHeaterCoolerState,
        this.cacheCool === 'on' ? 3 : 1
      )
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(
          this.hapChar.HeatingThresholdTemperature,
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
      let newCool
      if (this.cacheTemp > this.accessory.context.cacheTarget) {
        params.mainSwitch = 'on'
        params.switch = 'on'
        newCool = 'on'
      } else {
        params.mainSwitch = 'off'
        params.switch = 'off'
        newCool = 'off'
      }
      if (newCool === this.cacheCool) {
        return
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheCool = newCool
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curCool, this.cacheCool)
      }
      this.service.updateCharacteristic(
        this.hapChar.CurrentHeaterCoolerState,
        this.cacheCool === 'on' ? 3 : 1
      )
    } catch (err) {
      // Suppress errors here
    }
  }

  async internalUIUpdate () {
    try {
      const params = { uiActive: 120 }
      await this.platform.sendDeviceUpdate(this.accessory, params, false)
    } catch (err) {
      // Suppress errors here
    }
  }

  async externalUpdate (params) {
    try {
      if (
        this.funcs.hasProperty(params, 'currentTemperature') &&
        params.currentTemperature !== 'unavailable' &&
        this.cacheTempRaw !== params.currentTemperature
      ) {
        this.cacheTempRaw = params.currentTemperature
        this.cacheTemp = Number(params.currentTemperature) + this.tempOffset
        this.service.updateCharacteristic(this.hapChar.CurrentTemperature, this.cacheTemp)
        this.accessory.eveService.addEntry({ temp: this.cacheTemp })
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s°C].', this.name, this.lang.curTemp, this.cacheTemp)
        }
        await this.internalCurrentTempUpdate()
      }
      if (
        this.funcs.hasProperty(params, 'currentHumidity') &&
        params.currentHumidity !== 'unavailable' &&
        this.humiService &&
        this.cacheHumiRaw !== params.currentHumidity
      ) {
        this.cacheHumiRaw = params.currentHumidity
        this.cacheHumi = Math.max(Math.min(parseInt(this.cacheHumiRaw) + this.humiOffset, 100), 0)
        this.humiService.updateCharacteristic(this.hapChar.CurrentRelativeHumidity, this.cacheHumi)
        this.accessory.eveService.addEntry({ humidity: this.cacheHumi })
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s%].', this.name, this.lang.curHumi, this.cacheHumi)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
