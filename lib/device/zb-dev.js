/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const corrInterval = require('correcting-interval')
const fakegato = require('fakegato-history')
const helpers = require('./../helpers')
module.exports = class deviceZBDev {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.EveHistoryService = fakegato(platform.api)
    if (!accessory.getService(this.Service.BatteryService)) accessory.addService(this.Service.BatteryService)
    switch (accessory.context.eweUIID) {
      case 1000: {
        const zbspsService =
          accessory.getService(this.Service.StatelessProgrammableSwitch) ||
          accessory.addService(this.Service.StatelessProgrammableSwitch)
        if (this.platform.config.hideZBLDPress) {
          zbspsService.getCharacteristic(this.Characteristic.ProgrammableSwitchEvent).setProps({
            validValues: [0]
          })
        }
        break
      }
      case 1770: {
        const zbTempService =
          accessory.getService(this.Service.TemperatureSensor) || accessory.addService(this.Service.TemperatureSensor)
        const zbHumiService =
          accessory.getService(this.Service.HumiditySensor) || accessory.addService(this.Service.HumiditySensor)
        if (!this.platform.config.disableEveLogging) {
          accessory.log = this.platform.log
          accessory.eveLogger = new this.EveHistoryService('weather', accessory, {
            storage: 'fs',
            minutes: 5,
            path: this.platform.eveLogPath
          })
          corrInterval.setCorrectingInterval(() => {
            const dataToAdd = {
              time: Date.now(),
              temp: zbTempService.getCharacteristic(this.Characteristic.CurrentTemperature).value,
              humidity: zbHumiService.getCharacteristic(this.Characteristic.CurrentRelativeHumidity).value
            }
            accessory.eveLogger.addEntry(dataToAdd)
          }, 300000)
        }
        break
      }
      case 2026:
        if (!accessory.getService(this.Service.MotionSensor)) accessory.addService(this.Service.MotionSensor)
        break
      case 3026:
        if (!accessory.getService(this.Service.ContactSensor)) accessory.addService(this.Service.ContactSensor)
        break
    }
    this.accessory = accessory
  }

  async externalUpdate (params) {
    try {
      //* ** credit @tasict ***\\
      if (helpers.hasProperty(params, 'battery')) {
        if (this.accessory.context.eweUIID === 3026 && this.platform.config.ZBDWBatt) {
          params.battery *= 10
        }
        const batteryService =
          this.accessory.getService(this.Service.BatteryService) || this.accessory.addService(this.Service.BatteryService)
        batteryService.updateCharacteristic(this.Characteristic.BatteryLevel, params.battery)
        batteryService.updateCharacteristic(
          this.Characteristic.StatusLowBattery,
          params.battery < (this.platform.config.lowBattThreshold || 25)
        )
      }
      switch (this.accessory.context.eweUIID) {
        case 1000:
          if (helpers.hasProperty(params, 'key') && [0, 1, 2].includes(params.key)) {
            this.accessory
              .getService(this.Service.StatelessProgrammableSwitch)
              .updateCharacteristic(this.Characteristic.ProgrammableSwitchEvent, params.key)
          }
          break
        case 1770: {
          const eveLog = { time: Date.now() }
          if (helpers.hasProperty(params, 'temperature')) {
            const currentTemp = parseInt(params.temperature) / 100
            this.accessory
              .getService(this.Service.TemperatureSensor)
              .updateCharacteristic(this.Characteristic.CurrentTemperature, currentTemp)
            eveLog.temp = parseFloat(currentTemp)
          }
          if (helpers.hasProperty(params, 'humidity')) {
            const currentHumi = parseInt(params.humidity) / 100
            this.accessory
              .getService(this.Service.HumiditySensor)
              .updateCharacteristic(this.Characteristic.CurrentRelativeHumidity, currentHumi)
            eveLog.humidity = parseFloat(currentHumi)
          }
          if (
            !this.platform.config.disableEveLogging &&
            (helpers.hasProperty(eveLog, 'temp') || helpers.hasProperty(eveLog, 'humidity'))
          ) {
            this.accessory.eveLogger.addEntry(eveLog)
          }
          break
        }
        case 2026:
          if (helpers.hasProperty(params, 'motion') && helpers.hasProperty(params, 'trigTime')) {
            const timeNow = new Date()
            const diff = (timeNow.getTime() - params.trigTime) / 1000
            this.accessory
              .getService(this.Service.MotionSensor)
              .updateCharacteristic(
                this.Characteristic.MotionDetected,
                helpers.hasProperty(params, 'updateSource') &&
                  params.motion === 1 &&
                  diff < (this.platform.config.sensorTimeDifference || 120)
              )
            break
          }
          break
        case 3026:
          if (helpers.hasProperty(params, 'lock') && [0, 1].includes(params.lock)) {
            this.accessory
              .getService(this.Service.ContactSensor)
              .updateCharacteristic(this.Characteristic.ContactSensorState, params.lock)
          }
          break
        default:
          throw new Error('Zigbee device type not supported [uiid ' + this.accessory.context.eweUIID + ']')
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
