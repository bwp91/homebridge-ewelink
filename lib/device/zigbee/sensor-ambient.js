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
    const deviceConf = platform.sensorDevices[accessory.context.eweDeviceId]
    this.lowBattThreshold =
      deviceConf && deviceConf.lowBattThreshold
        ? Math.min(deviceConf.lowBattThreshold, 100)
        : platform.consts.defaultValues.lowBattThreshold
    this.tempOffset =
      deviceConf && deviceConf.offset ? deviceConf.offset : platform.consts.defaultValues.offset
    this.humiOffset =
      deviceConf && deviceConf.humidityOffset
        ? deviceConf.humidityOffset
        : platform.consts.defaultValues.humidityOffset
    this.disableDeviceLogging =
      deviceConf && deviceConf.overrideDisabledLogging
        ? false
        : platform.config.disableDeviceLogging

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
      this.accessory.getService(this.hapServ.BatteryService) ||
      this.accessory.addService(this.hapServ.BatteryService)

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('weather', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log if in debug mode
    if (platform.config.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        humidityOffset: this.humiOffset,
        lowBattThreshold: this.lowBattThreshold,
        offset: this.tempOffset
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.funcs.hasProperty(params, 'battery') && params.battery !== this.cacheBatt) {
        this.cacheBatt = params.battery
        this.cacheBattScaled = Math.max(Math.min(this.cacheBatt, 100), 0)
        this.battService.updateCharacteristic(this.hapChar.BatteryLevel, this.cacheBattScaled)
        this.battService.updateCharacteristic(
          this.hapChar.StatusLowBattery,
          this.cacheBattScaled < this.lowBattThreshold
        )
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s%].', this.name, this.lang.curBatt, this.cacheBattScaled)
        }
      }
      const eveLog = {}
      if (
        this.funcs.hasProperty(params, 'temperature') &&
        params.temperature !== this.cacheTempRaw
      ) {
        this.cacheTempRaw = params.temperature
        this.cacheTemp = parseInt(this.cacheTemp) / 100 + this.tempOffset
        this.tempService.updateCharacteristic(this.hapChar.CurrentTemperature, this.cacheTemp)
        eveLog.temp = this.cacheTemp
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s°C].', this.name, this.lang.curTemp, this.cacheTemp)
        }
      }
      if (this.funcs.hasProperty(params, 'humidity') && params.humidity !== this.cacheHumiRaw) {
        this.cacheHumiRaw = params.humidity
        this.cacheHumi = Math.max(
          Math.Min(parseInt(this.cacheHumiRaw) / 100 + this.humiOffset, 100),
          0
        )
        this.humiService.updateCharacteristic(this.hapChar.CurrentRelativeHumidity, this.cacheHumi)
        eveLog.humidity = this.cacheHumi
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s%].', this.name, this.lang.curHumi, this.cacheHumi)
        }
      }
      if (eveLog.temp || eveLog.humidity) {
        eveLog.time = Math.round(new Date().valueOf() / 1000)
        this.accessory.eveService.addEntry(eveLog)
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
