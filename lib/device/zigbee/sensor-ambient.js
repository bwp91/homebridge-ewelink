/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceZBSensorAmbient {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.funcs = platform.funcs
    this.hapChar = platform.api.hap.Characteristic
    this.hapServ = platform.api.hap.Service
    this.lang = platform.lang
    this.log = platform.log
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceConf = platform.deviceConf[accessory.context.eweDeviceId]
    this.lowBattThreshold =
      deviceConf && deviceConf.lowBattThreshold
        ? Math.min(deviceConf.lowBattThreshold, 100)
        : platform.consts.defaultValues.lowBattThreshold
    this.tempOffset =
      deviceConf && deviceConf.offset ? deviceConf.offset : platform.consts.defaultValues.offset
    this.tempOffsetFactor = deviceConf && deviceConf.offsetFactor
    this.humiOffset =
      deviceConf && deviceConf.humidityOffset
        ? parseInt(deviceConf.humidityOffset)
        : platform.consts.defaultValues.humidityOffset
    this.humiOffsetFactor = deviceConf && deviceConf.humidityOffsetFactor

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

    // Add the temperature sensor service if it doesn't already exist
    this.tempService =
      this.accessory.getService(this.hapServ.TemperatureSensor) ||
      this.accessory.addService(this.hapServ.TemperatureSensor)

    // Add options to the current temperature characteristic
    this.tempService.getCharacteristic(this.hapChar.CurrentTemperature).setProps({
      minStep: 0.1
    })

    // Add the humidity sensor service if it doesn't already exist
    this.humiService =
      this.accessory.getService(this.hapServ.HumiditySensor) ||
      this.accessory.addService(this.hapServ.HumiditySensor)

    // Add the battery service if it doesn't already exist
    this.battService =
      this.accessory.getService(this.hapServ.Battery) ||
      this.accessory.addService(this.hapServ.Battery)

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('weather', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log
    const opts = JSON.stringify({
      humidityOffset: this.humiOffset,
      humidityOffsetFactor: this.humiOffsetFactor,
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable',
      lowBattThreshold: this.lowBattThreshold,
      offset: this.tempOffset,
      offsetFactor: this.tempOffsetFactor
    })
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
  }

  async externalUpdate (params) {
    try {
      if (this.funcs.hasProperty(params, 'battery') && params.battery !== this.cacheBatt) {
        this.cacheBatt = params.battery
        this.cacheBattScaled = Math.max(Math.min(this.cacheBatt, 100), 0)
        this.battService.updateCharacteristic(this.hapChar.BatteryLevel, this.cacheBattScaled)
        this.battService.updateCharacteristic(
          this.hapChar.StatusLowBattery,
          this.cacheBattScaled < this.lowBattThreshold ? 1 : 0
        )
        if (params.updateSource && this.enableLogging) {
          this.log('[%s] %s [%s%].', this.name, this.lang.curBatt, this.cacheBattScaled)
        }
      }
      if (this.funcs.hasProperty(params, 'temperature')) {
        let newTemp = parseInt(params.temperature) / 100
        if (this.tempOffsetFactor) {
          newTemp *= this.tempOffset
        } else {
          newTemp += this.tempOffset
        }
        if (newTemp !== this.cacheTemp) {
          this.cacheTemp = newTemp
          this.tempService.updateCharacteristic(this.hapChar.CurrentTemperature, this.cacheTemp)
          this.accessory.eveService.addEntry({ temp: this.cacheTemp })
          if (params.updateSource && this.enableLogging) {
            this.log('[%s] %s [%s°C].', this.name, this.lang.curTemp, this.cacheTemp)
          }
        }
      }
      if (this.funcs.hasProperty(params, 'humidity')) {
        let newHumi = parseInt(params.humidity) / 100
        if (this.humiOffsetFactor) {
          newHumi *= this.humiOffset
        } else {
          newHumi += this.humiOffset
        }
        newHumi = Math.max(Math.min(parseInt(newHumi), 100), 0)
        if (newHumi !== this.cacheHumi) {
          this.cacheHumi = newHumi
          this.humiService.updateCharacteristic(
            this.hapChar.CurrentRelativeHumidity,
            this.cacheHumi
          )
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

  currentState () {
    const toReturn = {}
    toReturn.services = ['temperature', 'humidity', 'battery']
    toReturn.temperature = {
      current: this.tempService.getCharacteristic(this.hapChar.CurrentTemperature).value
    }
    toReturn.humidity = {
      current: this.humiService.getCharacteristic(this.hapChar.CurrentRelativeHumidity).value
    }
    toReturn.battery = {
      current: this.battService.getCharacteristic(this.hapChar.BatteryLevel).value
    }
    return toReturn
  }
}
