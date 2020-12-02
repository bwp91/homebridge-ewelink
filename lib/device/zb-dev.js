/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceZBDev {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.lowBattThreshold = parseInt(this.platform.config.lowBattThreshold)
    this.lowBattThreshold = isNaN(this.lowBattThreshold)
      ? this.helpers.defaults.lowBattThreshold
      : this.lowBattThreshold < 5
        ? this.helpers.defaults.lowBattThreshold
        : this.lowBattThreshold
    this.sensorTimeDifference = parseInt(this.platform.config.sensorTimeDifference)
    this.sensorTimeDifference = isNaN(this.sensorTimeDifference)
      ? this.helpers.defaults.sensorTimeDifference
      : this.sensorTimeDifference < 10
        ? this.helpers.defaults.sensorTimeDifference
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
        accessory.log = this.log
        accessory.eveLogger = new this.platform.eveService('switch', accessory, {
          storage: 'fs',
          path: this.platform.eveLogPath
        })
        accessory.getService(this.Service.Switch)
          .getCharacteristic(this.Characteristic.On)
          .on('set', this.internalUpdate.bind(this))
        break
      case 1770: {
        if (!accessory.getService(this.Service.BatteryService)) accessory.addService(this.Service.BatteryService)
        const tempService = accessory.getService(this.Service.TemperatureSensor) || accessory.addService(this.Service.TemperatureSensor)
        tempService.getCharacteristic(this.Characteristic.CurrentTemperature)
          .setProps({
            minValue: -100
          })
        if (!accessory.getService(this.Service.HumiditySensor)) accessory.addService(this.Service.HumiditySensor)
        accessory.log = this.log
        accessory.eveLogger = new this.platform.eveService('weather', accessory, {
          storage: 'fs',
          path: this.platform.eveLogPath
        })
        break
      }
      case 2026:
        if (!accessory.getService(this.Service.BatteryService)) accessory.addService(this.Service.BatteryService)
        if (!accessory.getService(this.Service.MotionSensor)) accessory.addService(this.Service.MotionSensor)
        accessory.log = this.log
        accessory.eveLogger = new this.platform.eveService('motion', accessory, {
          storage: 'fs',
          path: this.platform.eveLogPath
        })
        break
      case 3026:
        if (!accessory.getService(this.Service.BatteryService)) accessory.addService(this.Service.BatteryService)
        if (!accessory.getService(this.Service.ContactSensor)) accessory.addService(this.Service.ContactSensor)
        accessory.log = this.log
        accessory.eveLogger = new this.platform.eveService('door', accessory, {
          storage: 'fs',
          path: this.platform.eveLogPath
        })
        break
    }
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      const params = { switch: value ? 'on' : 'off' }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      //* ** credit @tasict ***\\
      if (this.helpers.hasProperty(params, 'battery')) {
        if (this.accessory.context.eweUIID === 3026 && this.platform.config.ZBDWBatt) {
          params.battery *= 10
        }
        const batteryService =
          this.accessory.getService(this.Service.BatteryService) || this.accessory.addService(this.Service.BatteryService)
        batteryService.updateCharacteristic(this.Characteristic.BatteryLevel, params.battery)
        batteryService.updateCharacteristic(
          this.Characteristic.StatusLowBattery,
          params.battery < this.lowBattThreshold
        )
      }
      switch (this.accessory.context.eweUIID) {
        case 1000:
          if (this.helpers.hasProperty(params, 'key') && [0, 1, 2].includes(params.key)) {
            this.accessory
              .getService(this.Service.StatelessProgrammableSwitch)
              .updateCharacteristic(this.Characteristic.ProgrammableSwitchEvent, params.key)
          }
          break
        case 1009:
        case 1256:
          if (this.helpers.hasProperty(params, 'switch') && ['off', 'on'].includes(params.switch)) {
            this.accessory
              .getService(this.Service.Switch)
              .updateCharacteristic(this.Characteristic.On, params.switch === 'on')
            this.accessory.eveLogger.addEntry({
              time: Math.round(new Date().valueOf() / 1000),
              status: params.switch === 'on' ? 1 : 0
            })
          }
          break
        case 1770: {
          const eveLog = { time: Math.round(new Date().valueOf() / 1000) }
          if (this.helpers.hasProperty(params, 'temperature')) {
            const currentTemp = parseInt(params.temperature) / 100
            this.accessory
              .getService(this.Service.TemperatureSensor)
              .updateCharacteristic(this.Characteristic.CurrentTemperature, currentTemp)
            eveLog.temp = parseFloat(currentTemp)
          }
          if (this.helpers.hasProperty(params, 'humidity')) {
            const currentHumi = parseInt(params.humidity) / 100
            this.accessory
              .getService(this.Service.HumiditySensor)
              .updateCharacteristic(this.Characteristic.CurrentRelativeHumidity, currentHumi)
            eveLog.humidity = parseFloat(currentHumi)
          }
          if (this.helpers.hasProperty(eveLog, 'temp') || this.helpers.hasProperty(eveLog, 'humidity')) {
            this.accessory.eveLogger.addEntry(eveLog)
          }
          break
        }
        case 2026:
          if (this.helpers.hasProperty(params, 'motion') && this.helpers.hasProperty(params, 'trigTime')) {
            const timeNow = new Date()
            const diff = (timeNow.getTime() - params.trigTime) / 1000
            const motionDetected =
              this.helpers.hasProperty(params, 'updateSource') &&
              params.motion === 1 &&
              diff < this.sensorTimeDifference
            this.accessory.eveLogger.addEntry({
              time: Math.round(new Date().valueOf() / 1000),
              status: motionDetected ? 1 : 0
            })
            this.accessory.getService(this.Service.MotionSensor).updateCharacteristic(this.Characteristic.MotionDetected, motionDetected)
            break
          }
          break
        case 3026:
          if (this.helpers.hasProperty(params, 'lock') && [0, 1].includes(params.lock)) {
            this.accessory
              .getService(this.Service.ContactSensor)
              .updateCharacteristic(this.Characteristic.ContactSensorState, params.lock)
            this.accessory.eveLogger.addEntry({
              time: Math.round(new Date().valueOf() / 1000),
              status: params.lock
            })
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
