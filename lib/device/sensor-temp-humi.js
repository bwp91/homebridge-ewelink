/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSensorTempHumi {
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

    // Add the temperature sensor service if it doesn't already exist
    this.tempService = this.accessory.getService(this.hapServ.TemperatureSensor) ||
      this.accessory.addService(this.hapServ.TemperatureSensor)

    // Set custom properties of the current temperature characteristic
    this.tempService.getCharacteristic(this.hapChar.CurrentTemperature).setProps({
      minStep: 0.1
    })

    // Add the humidity sensor service if it doesn't already exist
    this.humiService = this.accessory.getService(this.hapServ.HumiditySensor) ||
      this.accessory.addService(this.hapServ.HumiditySensor)

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

  async externalUpdate (params) {
    try {
      const eveLog = {}
      if (this.funcs.hasProperty(params, 'temperature')) {
        const currentTemp = Number(params.temperature) + this.tempOffset
        eveLog.temp = currentTemp
        if (this.cacheTemp !== currentTemp) {
          this.cacheTemp = currentTemp
          this.tempService
            .updateCharacteristic(this.hapChar.CurrentTemperature, this.cacheTemp)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current temperature [%s°C].', this.name, this.cacheTemp)
          }
        }
      }
      if (this.funcs.hasProperty(params, 'humidity')) {
        const currentHumi = parseInt(params.humidity)
        eveLog.humidity = currentHumi
        if (this.cacheHumi !== currentHumi) {
          this.cacheHumi = currentHumi
          this.humiService
            .updateCharacteristic(this.hapChar.CurrentRelativeHumidity, this.cacheHumi)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current humidity [%s%].', this.name, this.cacheHumi)
          }
        }
      }
      if (
        this.funcs.hasProperty(eveLog, 'temp') ||
        this.funcs.hasProperty(eveLog, 'humidity')
      ) {
        this.accessory.eveService.addEntry(eveLog)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
