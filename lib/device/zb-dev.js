/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const fakegato = require('./../fakegato/fakegato-history')
const helpers = require('./../helpers')
module.exports = class deviceZBDev {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.EveHistoryService = fakegato(platform.api)
    this.lowBattThreshold = parseInt(this.platform.config.lowBattThreshold)
    this.lowBattThreshold = isNaN(this.lowBattThreshold)
      ? helpers.defaults.lowBattThreshold
      : this.lowBattThreshold < 5
        ? helpers.defaults.lowBattThreshold
        : this.lowBattThreshold
    this.sensorTimeDifference = parseInt(this.platform.config.sensorTimeDifference)
    this.sensorTimeDifference = isNaN(this.sensorTimeDifference)
      ? helpers.defaults.sensorTimeDifference
      : this.sensorTimeDifference < 10
        ? helpers.defaults.sensorTimeDifference
        : this.sensorTimeDifference
    switch (accessory.context.eweUIID) {
      case 1000: {
        if (!accessory.getService(this.Service.BatteryService)) accessory.addService(this.Service.BatteryService)
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
      case 1009:
      case 1256:
        if (accessory.getService(this.Service.BatteryService)) accessory.removeService(accessory.getService(this.Service.BatteryService))
        if (!accessory.getService(this.Service.Switch)) accessory.addService(this.Service.Switch)
        accessory.log = this.platform.log
        accessory.eveLogger = new this.EveHistoryService('switch', accessory, {
          storage: 'fs',
          path: this.platform.eveLogPath
        })
        accessory.getService(this.Service.Switch)
          .getCharacteristic(this.Characteristic.On)
          .on('set', (value, callback) => this.internalUpdate(accessory, value, callback))
        break
      case 1770:
        if (!accessory.getService(this.Service.BatteryService)) accessory.addService(this.Service.BatteryService)
        if (!accessory.getService(this.Service.TemperatureSensor)) accessory.addService(this.Service.TemperatureSensor)
        if (!accessory.getService(this.Service.HumiditySensor)) accessory.addService(this.Service.HumiditySensor)
        accessory.log = this.platform.log
        accessory.eveLogger = new this.EveHistoryService('weather', accessory, {
          storage: 'fs',
          path: this.platform.eveLogPath
        })
        break
      case 2026:
        if (!accessory.getService(this.Service.BatteryService)) accessory.addService(this.Service.BatteryService)
        if (!accessory.getService(this.Service.MotionSensor)) accessory.addService(this.Service.MotionSensor)
        accessory.log = this.platform.log
        accessory.eveLogger = new this.EveHistoryService('motion', accessory, {
          storage: 'fs',
          path: this.platform.eveLogPath
        })
        break
      case 3026:
        if (!accessory.getService(this.Service.BatteryService)) accessory.addService(this.Service.BatteryService)
        if (!accessory.getService(this.Service.ContactSensor)) accessory.addService(this.Service.ContactSensor)
        accessory.log = this.platform.log
        accessory.eveLogger = new this.EveHistoryService('door', accessory, {
          storage: 'fs',
          path: this.platform.eveLogPath
        })
        break
    }
    accessory = accessory
  }

  async internalUpdate (accessory, value, callback) {
    try {
      callback()
      const params = { switch: value ? 'on' : 'off' }
      await this.platform.sendDeviceUpdate(accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {
      //* ** credit @tasict ***\\
      if (helpers.hasProperty(params, 'battery')) {
        if (accessory.context.eweUIID === 3026 && this.platform.config.ZBDWBatt) {
          params.battery *= 10
        }
        const batteryService =
          accessory.getService(this.Service.BatteryService) || accessory.addService(this.Service.BatteryService)
        batteryService.updateCharacteristic(this.Characteristic.BatteryLevel, params.battery)
        batteryService.updateCharacteristic(
          this.Characteristic.StatusLowBattery,
          params.battery < this.lowBattThreshold
        )
      }
      switch (accessory.context.eweUIID) {
        case 1000:
          if (helpers.hasProperty(params, 'key') && [0, 1, 2].includes(params.key)) {
            accessory
              .getService(this.Service.StatelessProgrammableSwitch)
              .updateCharacteristic(this.Characteristic.ProgrammableSwitchEvent, params.key)
          }
          break
        case 1009:
        case 1256:
          if (helpers.hasProperty(params, 'switch') && ['off', 'on'].includes(params.switch)) {
            accessory
              .getService(this.Service.Switch)
              .updateCharacteristic(this.Characteristic.On, params.switch === 'on')
            accessory.eveLogger.addEntry({
              time: Math.round(new Date().valueOf() / 1000),
              status: params.switch === 'on' ? 1 : 0
            })
          }
          break
        case 1770: {
          const eveLog = { time: Math.round(new Date().valueOf() / 1000) }
          if (helpers.hasProperty(params, 'temperature')) {
            const currentTemp = parseInt(params.temperature) / 100
            accessory
              .getService(this.Service.TemperatureSensor)
              .updateCharacteristic(this.Characteristic.CurrentTemperature, currentTemp)
            eveLog.temp = parseFloat(currentTemp)
          }
          if (helpers.hasProperty(params, 'humidity')) {
            const currentHumi = parseInt(params.humidity) / 100
            accessory
              .getService(this.Service.HumiditySensor)
              .updateCharacteristic(this.Characteristic.CurrentRelativeHumidity, currentHumi)
            eveLog.humidity = parseFloat(currentHumi)
          }
          if (helpers.hasProperty(eveLog, 'temp') || helpers.hasProperty(eveLog, 'humidity')) {
            accessory.eveLogger.addEntry(eveLog)
          }
          break
        }
        case 2026:
          if (helpers.hasProperty(params, 'motion') && helpers.hasProperty(params, 'trigTime')) {
            const timeNow = new Date()
            const diff = (timeNow.getTime() - params.trigTime) / 1000
            const motionDetected =
              helpers.hasProperty(params, 'updateSource') &&
              params.motion === 1 &&
              diff < this.sensorTimeDifference
            accessory.eveLogger.addEntry({
              time: Math.round(new Date().valueOf() / 1000),
              status: motionDetected ? 1 : 0
            })
            accessory.getService(this.Service.MotionSensor).updateCharacteristic(this.Characteristic.MotionDetected, motionDetected)
            break
          }
          break
        case 3026:
          if (helpers.hasProperty(params, 'lock') && [0, 1].includes(params.lock)) {
            accessory
              .getService(this.Service.ContactSensor)
              .updateCharacteristic(this.Characteristic.ContactSensorState, params.lock)
            accessory.eveLogger.addEntry({
              time: Math.round(new Date().valueOf() / 1000),
              status: params.lock
            })
          }
          break
        default:
          throw new Error('Zigbee device type not supported [uiid ' + accessory.context.eweUIID + ']')
      }
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
