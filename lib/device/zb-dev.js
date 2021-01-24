/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const util = require('util')
module.exports = class deviceZBDev {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    this.dName = accessory.displayName
    this.accessory = accessory

    const self = this
    this.eveLastActivation = function () {
      self.C.call(this, 'Last Activation', self.helpers.eveUUID.lastActivation)
      this.setProps({
        format: self.C.Formats.UINT32,
        unit: self.C.Units.SECONDS,
        perms: [self.C.Perms.READ, self.C.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    util.inherits(this.eveLastActivation, this.C)
    this.eveLastActivation.UUID = this.helpers.eveUUID.lastActivation
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
    switch (this.accessory.context.eweUIID) {
      case 1000: {
        if (!this.accessory.getService(this.S.BatteryService)) {
          this.accessory.addService(this.S.BatteryService)
        }
        const zbspsService =
          this.accessory.getService(this.S.StatelessProgrammableSwitch) ||
          this.accessory.addService(this.S.StatelessProgrammableSwitch)
        if (this.platform.config.hideZBLDPress) {
          zbspsService
            .getCharacteristic(this.C.ProgrammableSwitchEvent)
            .setProps({ validValues: [0] })
        }
        break
      }
      case 1009:
      case 1256:
        if (this.accessory.getService(this.S.BatteryService)) {
          this.accessory.removeService(this.accessory.getService(this.S.BatteryService))
        }
        if (!this.accessory.getService(this.S.Switch)) {
          this.accessory.addService(this.S.Switch)
        }
        this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
        this.accessory.historyService = new this.platform.eveService('switch', this.accessory, {
          storage: 'fs',
          path: platform.eveLogPath
        })
        this.accessory.getService(this.S.Switch).getCharacteristic(this.C.On)
          .on('set', this.internalUpdate.bind(this))
        break
      case 1770: {
        if (!this.accessory.getService(this.S.BatteryService)) {
          this.accessory.addService(this.S.BatteryService)
        }
        const tService = this.accessory.getService(this.S.TemperatureSensor) || this.accessory.addService(this.S.TemperatureSensor)
        tService.getCharacteristic(this.C.CurrentTemperature)
          .setProps({ minValue: -100 })
        if (!this.accessory.getService(this.S.HumiditySensor)) {
          this.accessory.addService(this.S.HumiditySensor)
        }
        this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
        this.accessory.historyService = new this.platform.eveService('weather', this.accessory, {
          storage: 'fs',
          path: platform.eveLogPath
        })
        break
      }
      case 2026:
        if (!this.accessory.getService(this.S.BatteryService)) {
          this.accessory.addService(this.S.BatteryService)
        }
        if (!this.accessory.getService(this.S.MotionSensor)) {
          this.accessory.addService(this.S.MotionSensor)
        }
        this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
        this.accessory.historyService = new this.platform.eveService('motion', this.accessory, {
          storage: 'fs',
          path: platform.eveLogPath
        })
        break
      case 3026:
        if (!this.accessory.getService(this.S.BatteryService)) {
          this.accessory.addService(this.S.BatteryService)
        }
        if (!this.accessory.getService(this.S.ContactSensor)) {
          this.accessory.addService(this.S.ContactSensor)
        }
        this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
        this.accessory.historyService = new this.platform.eveService('door', this.accessory, {
          storage: 'fs',
          path: platform.eveLogPath
        })
        break
    }
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      await this.platform.sendDeviceUpdate(this.accessory, {
        switch: value ? 'on' : 'off'
      })
      this.cacheOnOff = value ? 'on' : 'off'
      this.accessory.historyService.addEntry({
        time: Math.round(new Date().valueOf() / 1000),
        status: value ? 1 : 0
      })
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.dName, value ? 'on' : 'off')
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      //* ** credit @tasict ***\\
      if (params.battery) {
        if (this.accessory.context.eweUIID === 3026 && this.platform.config.ZBDWBatt) params.battery *= 10
        if (params.battery !== this.cacheBattery) {
          const batt = this.accessory.getService(this.S.BatteryService) || this.accessory.addService(this.S.BatteryService)
          batt.updateCharacteristic(this.C.BatteryLevel, params.battery)
          batt.updateCharacteristic(this.C.StatusLowBattery, params.battery < this.lowBattThreshold)
          this.cacheBattery = params.battery
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current battery [%s%].', this.dName, params.battery)
          }
        }
      }
      switch (this.accessory.context.eweUIID) {
        case 1000:
          if (this.helpers.hasProperty(params, 'key') && [0, 1, 2].includes(params.key)) {
            this.accessory.getService(this.S.StatelessProgrammableSwitch)
              .updateCharacteristic(this.C.ProgrammableSwitchEvent, params.key)
            if (params.updateSource && !this.disableDeviceLogging) {
              this.log(
                '[%s] current state [%s].',
                this.dName,
                params.key === 0
                  ? 'single press'
                  : params.key === 1
                    ? 'double press'
                    : 'long press'
              )
            }
          }
          break
        case 1009:
        case 1256:
          if (params.switch && params.switch !== this.cacheOnOff) {
            this.accessory.getService(this.S.Switch)
              .updateCharacteristic(this.C.On, params.switch === 'on')
            this.cacheOnOff = params.switch
            this.accessory.historyService.addEntry({
              time: Math.round(new Date().valueOf() / 1000),
              status: params.switch === 'on' ? 1 : 0
            })
            if (params.updateSource && !this.disableDeviceLogging) {
              this.log('[%s] current state [%s].', this.dName, params.switch)
            }
          }
          break
        case 1770: {
          const eveLog = {}
          if (params.temperature && params.temperature !== this.cacheTemp) {
            this.cacheTemp = params.temperature
            const currentTemp = parseInt(params.temperature) / 100
            this.accessory.getService(this.S.TemperatureSensor)
              .updateCharacteristic(this.C.CurrentTemperature, currentTemp)
            if (params.updateSource && !this.disableDeviceLogging) {
              this.log('[%s] current temperature [%s].', this.dName, currentTemp)
            }
            eveLog.temp = currentTemp
          }
          if (params.humidity && params.humidity !== this.cacheHumi) {
            this.cacheHumi = params.humidity
            const currentHumi = parseInt(params.humidity) / 100
            this.accessory.getService(this.S.HumiditySensor)
              .updateCharacteristic(this.C.CurrentRelativeHumidity, currentHumi)
            eveLog.humidity = currentHumi
            if (params.updateSource && !this.disableDeviceLogging) {
              this.log('[%s] current humidity [%s].', this.dName, currentHumi)
            }
          }
          if (eveLog.temp || eveLog.humidity) {
            eveLog.time = Math.round(new Date().valueOf() / 1000)
            this.accessory.historyService.addEntry(eveLog)
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
            this.accessory.historyService.addEntry({
              time: Math.round(new Date().valueOf() / 1000),
              status: motionDetected ? 1 : 0
            })
            if (params.updateSource && !this.disableDeviceLogging) {
              this.log('[%s] current state [motion%s detected].', this.dName, motionDetected ? '' : ' not')
            }
            if (motionDetected) {
              this.accessory.getService(this.S.MotionSensor)
                .updateCharacteristic(
                  this.eveLastActivation,
                  Math.round(new Date().valueOf() / 1000) - this.accessory.historyService.getInitialTime()
                )
            }
            this.accessory.getService(this.S.MotionSensor)
              .updateCharacteristic(this.C.MotionDetected, motionDetected)
            break
          }
          break
        case 3026:
          if (this.helpers.hasProperty(params, 'lock') && [0, 1].includes(params.lock)) {
            this.accessory.getService(this.S.ContactSensor)
              .updateCharacteristic(this.C.ContactSensorState, params.lock)
            if (params.updateSource && !this.disableDeviceLogging) {
              this.log('[%s] current state [contact%s detected].', this.dName, params.lock === 0 ? '' : ' not')
            }
            this.accessory.historyService.addEntry({
              time: Math.round(new Date().valueOf() / 1000),
              status: params.lock
            })
            if (params.lock === 1) {
              this.accessory.getService(this.S.ContactSensor)
                .updateCharacteristic(
                  this.eveLastActivation,
                  Math.round(new Date().valueOf() / 1000) - this.accessory.historyService.getInitialTime()
                )
            }
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
