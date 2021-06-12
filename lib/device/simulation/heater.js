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

    // Check to make sure user has not switched from cooler to heater
    if (this.accessory.context.cacheType !== 'heater') {
      // Remove and re-setup as a HeaterCooler
      if (this.accessory.getService(this.hapServ.HeaterCooler)) {
        this.accessory.removeService(this.accessory.getService(this.hapServ.HeaterCooler))
      }
      this.accessory.context.cacheType = 'heater'
    }

    // If the accessory has a thermostat service then remove it
    if (this.accessory.getService(this.hapServ.Thermostat)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Thermostat))
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

    this.service.setPrimaryService()

    // Set custom properties of the current temperature characteristic
    this.service.getCharacteristic(this.hapChar.CurrentTemperature).setProps({
      minStep: 0.1
    })

    // Add the set handler to the heater active characteristic
    this.service.getCharacteristic(this.hapChar.Active).onSet(async value => {
      await this.internalStateUpdate(value)
    })

    // Add the set handler to the target state characteristic
    this.service.getCharacteristic(this.hapChar.TargetHeaterCoolerState).setProps({
      minValue: 0,
      maxValue: 0,
      validValues: [0]
    })

    // Add the set handler to the target temperature characteristic
    this.service
      .getCharacteristic(this.hapChar.HeatingThresholdTemperature)
      .setProps({
        minValue: this.minTarget,
        maxValue: this.maxTarget,
        minStep: 0.5
      })
      .onSet(async value => {
        await this.internalTargetTempUpdate(value)
      })

    // The DS18B20 sensor does not provide humidity readings
    if (
      this.accessory.context.sensorType !== 'DS18B20' &&
      !this.service.testCharacteristic(this.hapChar.CurrentRelativeHumidity)
    ) {
      this.service.addCharacteristic(this.hapChar.CurrentRelativeHumidity)
    }

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('custom', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Setting this now makes the plugin send the payload to setup as thermostat
    setTimeout(() => {
      this.service.setCharacteristic(
        this.hapChar.HeatingThresholdTemperature,
        this.accessory.context.cacheTarget
      )
    }, 5000)

    // Output the customised options to the log if in debug mode
    if (platform.config.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
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
      const params = { deviceType: 'temperature' }
      if (value === 0) {
        params.mainSwitch = 'off'
        params.switch = 'off'
      } else {
        params.mainSwitch = 'on'
        this.cacheHeat = this.cacheTemp < this.accessory.context.cacheTarget ? 'on' : 'off'
        params.switch = this.cacheHeat
      }
      const newValue = value === 0 ? 'off' : 'on'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheState = newValue
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
        if (value === 1) {
          this.service.updateCharacteristic(
            this.hapChar.CurrentHeaterCoolerState,
            this.cacheHeat === 'on' ? 2 : 1
          )
          this.log('[%s] %s [%s].', this.name, this.lang.curHeat, this.cacheHeat)
        } else {
          this.service.updateCharacteristic(this.hapChar.CurrentHeaterCoolerState, 0)
        }
      }
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
      const params = {
        deviceType: 'temperature',
        mainSwitch: 'on',
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
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.accessory.context.cacheTarget = value
      this.cacheState = 'on'
      this.accessory.context.cacheTarget = value
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s°C].', this.name, this.lang.curTarg, value)
      }
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

  async externalUpdate (params) {
    try {
      if (params.mainSwitch) {
        const newState = params.mainSwitch
        if (this.cacheState !== newState) {
          this.cacheState = newState
          this.service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0)
          this.accessory.eveService.addEntry({
            status: this.cacheState === 'on' ? 1 : 0
          })
          if (this.cacheState === 'off') {
            this.cacheHeat = 'off'
          }
          if (params.updateSource && !this.disableDeviceLogging && !params.switch) {
            this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
          }
        }
      }
      if (params.switch && params.switch !== this.cacheHeat) {
        this.cacheHeat = params.switch
        this.service.updateCharacteristic(
          this.hapChar.CurrentHeaterCoolerState,
          this.cacheHeat === 'on' ? 2 : this.cacheState === 'on' ? 1 : 0
        )
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curHeat, this.cacheHeat)
        }
      }
      if (
        this.funcs.hasProperty(params, 'currentTemperature') &&
        params.currentTemperature !== 'unavailable'
      ) {
        if (this.cacheTempRaw !== params.currentTemperature) {
          this.cacheTempRaw = params.currentTemperature
          this.cacheTemp = Number(params.currentTemperature) + this.tempOffset
          this.service.updateCharacteristic(this.hapChar.CurrentTemperature, this.cacheTemp)
          this.accessory.eveService.addEntry({ temp: this.cacheTemp })
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] %s [%s°C].', this.name, this.lang.curTemp, this.cacheTemp)
          }
        }
      }
      if (
        this.funcs.hasProperty(params, 'currentHumidity') &&
        params.currentHumidity !== 'unavailable' &&
        this.humiService
      ) {
        if (this.cacheHumiRaw !== params.currentHumidity) {
          this.cacheHumiRaw = params.currentHumidity
          this.cacheHumi = parseInt(params.currentHumidity)
          this.humiService.updateCharacteristic(
            this.hapChar.CurrentRelativeHumidity,
            this.cacheHumi
          )
          this.accessory.eveService.addEntry({ humidity: this.cacheHumi })
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] %s [%s%].', this.name, this.lang.curHumi, this.cacheHumi)
          }
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
