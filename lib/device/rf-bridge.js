/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceRFBridge {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.sensorTimeDifference = parseInt(this.platform.config.sensorTimeDifference)
    this.sensorTimeDifference = isNaN(this.sensorTimeDifference)
      ? this.helpers.defaults.sensorTimeDifference
      : this.sensorTimeDifference < 10
        ? this.helpers.defaults.sensorTimeDifference
        : this.sensorTimeDifference
    if (accessory.context.subType === 'button') {
      Object.entries(accessory.context.buttons).forEach(([chan, name]) => {
        if (!accessory.getService(name)) accessory.addService(this.Service.Switch, name, 'switch' + chan)
        accessory.getService(name).updateCharacteristic(this.Characteristic.On, false)
        accessory.getService(name)
          .getCharacteristic(this.Characteristic.On)
          .on('set', (value, callback) => this.internalUpdate(chan, name, value, callback))
      })
    } else {
      let serv
      let char
      let eveType
      switch (accessory.context.subType) {
        case 'water':
          serv = this.Service.LeakSensor
          char = this.Characteristic.LeakDetected
          eveType = 'motion'
          break
        case 'fire':
        case 'smoke':
          serv = this.Service.SmokeSensor
          char = this.Characteristic.SmokeDetected
          eveType = 'motion'
          break
        case 'co':
          serv = this.Service.CarbonMonoxideSensor
          char = this.Characteristic.CarbonMonoxideDetected
          eveType = 'motion'
          break
        case 'co2':
          serv = this.Service.CarbonDioxideSensor
          char = this.Characteristic.CarbonDioxideDetected
          eveType = 'motion'
          break
        case 'contact':
          serv = this.Service.ContactSensor
          char = this.Characteristic.ContactSensorState
          eveType = 'door'
          break
        case 'occupancy':
          serv = this.Service.OccupancySensor
          char = this.Characteristic.OccupancyDetected
          eveType = 'motion'
          break
        default:
          serv = this.Service.MotionSensor
          char = this.Characteristic.MotionDetected
          eveType = 'motion'
          break
      }
      const service = accessory.getService(serv) || accessory.addService(serv)
      service.updateCharacteristic(char, 0)
      accessory.log = this.log
      accessory.eveLogger = new this.platform.eveService(eveType, accessory, {
        storage: 'fs',
        path: this.platform.eveLogPath
      })
    }
    this.accessory = accessory
  }

  async internalUpdate (rfChl, service, value, callback) {
    try {
      callback()
      if (!value) return
      const params = {
        cmd: 'transmit',
        rfChl: parseInt(rfChl)
      }
      await this.helpers.sleep(1000)
      this.accessory.getService(service).updateCharacteristic(this.Characteristic.On, false)
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!this.helpers.hasProperty(params, 'updateSource')) return
      const timeNow = new Date()
      let oAccessory = false
      if (this.helpers.hasProperty(params, 'cmd') && params.cmd === 'transmit' && this.helpers.hasProperty(params, 'rfChl')) {
        this.platform.devicesInHB.forEach(acc => {
          if (
            acc.context.eweDeviceId === this.accessory.context.eweDeviceId &&
            this.helpers.hasProperty(acc.context, 'buttons') &&
            this.helpers.hasProperty(acc.context.buttons, params.rfChl.toString())
          ) {
            oAccessory = acc
          }
        })
        if (oAccessory) {
          oAccessory.getService(oAccessory.context.buttons[params.rfChl]).updateCharacteristic(this.Characteristic.On, 1)
          this.helpers.sleep(3000)
          oAccessory.getService(oAccessory.context.buttons[params.rfChl]).updateCharacteristic(this.Characteristic.On, 0)
        } else {
          throw new Error('rf button not found in Homebridge')
        }
      } else if (this.helpers.hasProperty(params, 'cmd') && params.cmd === 'trigger') {
        //* ** RF Sensor ***\\
        Object.keys(params)
          .filter(name => /rfTrig/.test(name))
          .forEach(async chan => {
            this.platform.devicesInHB.forEach(acc => {
              if (
                acc.context.eweDeviceId === this.accessory.context.eweDeviceId &&
                this.helpers.hasProperty(acc.context, 'buttons') &&
                this.helpers.hasProperty(acc.context.buttons, chan.split('g')[1].toString())
              ) {
                oAccessory = acc
              }
            })
            if (oAccessory) {
              const sensorTimeLengthPri = parseInt(oAccessory.context.sensorTimeLength)
              const sensorTimeLengthSec = parseInt(this.platform.config.sensorTimeLength)
              const sensorTimeLength = isNaN(sensorTimeLengthPri)
                ? isNaN(sensorTimeLengthSec)
                  ? this.helpers.defaults.sensorTimeLength
                  : sensorTimeLengthSec < 0
                    ? this.helpers.defaults.sensorTimeLength
                    : sensorTimeLengthSec
                : sensorTimeLengthPri < 0
                  ? isNaN(sensorTimeLengthSec)
                    ? this.helpers.defaults.sensorTimeLength
                    : sensorTimeLengthSec < 0
                      ? this.helpers.defaults.sensorTimeLength
                      : sensorTimeLengthSec
                  : sensorTimeLengthPri
              const timeOfMotion = new Date(params[chan])
              const diff = (timeNow.getTime() - timeOfMotion.getTime()) / 1000
              let serv
              let char
              if (diff < this.sensorTimeDifference) {
                switch (oAccessory.context.subType) {
                  case 'button':
                    return
                  case 'water':
                    serv = this.Service.LeakSensor
                    char = this.Characteristic.LeakDetected
                    break
                  case 'fire':
                  case 'smoke':
                    serv = this.Service.SmokeSensor
                    char = this.Characteristic.SmokeDetected
                    break
                  case 'co':
                    serv = this.Service.CarbonMonoxideSensor
                    char = this.Characteristic.CarbonMonoxideDetected
                    break
                  case 'co2':
                    serv = this.Service.CarbonDioxideSensor
                    char = this.Characteristic.CarbonDioxideDetected
                    break
                  case 'contact':
                    serv = this.Service.ContactSensor
                    char = this.Characteristic.ContactSensorState
                    break
                  case 'occupancy':
                    serv = this.Service.OccupancySensor
                    char = this.Characteristic.OccupancyDetected
                    break
                  default:
                    serv = this.Service.MotionSensor
                    char = this.Characteristic.MotionDetected
                    break
                }
                oAccessory.getService(serv).updateCharacteristic(char, 1)
                oAccessory.eveLogger.addEntry({
                  time: Math.round(new Date().valueOf() / 1000),
                  status: 1
                })
                await this.helpers.sleep(sensorTimeLength * 1000)
                oAccessory.getService(serv).updateCharacteristic(char, 0)
                oAccessory.eveLogger.addEntry({
                  time: Math.round(new Date().valueOf() / 1000),
                  status: 0
                })
              }
            }
          })
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
