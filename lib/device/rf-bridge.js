/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const helpers = require('./../helpers')
module.exports = class deviceRFBridge {
  constructor (platform, accessory) {
    this.platform = platform
    this.accessory = accessory
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    switch (accessory.context.subType) {
      case 'water':
        if (!accessory.getService(this.Service.LeakSensor)) accessory.addService(this.Service.LeakSensor)
        break
      case 'fire':
      case 'smoke':
        if (!accessory.getService(this.Service.SmokeSensor)) accessory.addService(this.Service.SmokeSensor)
        break
      case 'co':
        if (!accessory.getService(this.Service.CarbonMonoxideSensor)) accessory.addService(this.Service.CarbonMonoxideSensor)
        break
      case 'co2':
        if (!accessory.getService(this.Service.CarbonDioxideSensor)) accessory.addService(this.Service.CarbonDioxideSensor)
        break
      case 'contact':
        if (!accessory.getService(this.Service.ContactSensor)) accessory.addService(this.Service.ContactSensor)
        break
      case 'occupancy':
        if (!accessory.getService(this.Service.OccupancySensor)) accessory.addService(this.Service.OccupancySensor)
        break
      default:
        if (!accessory.getService(this.Service.MotionSensor)) accessory.addService(this.Service.MotionSensor)
        break
      case 'button':
        Object.entries(accessory.context.buttons).forEach(([chan, name]) => {
          if (!accessory.getService(name)) accessory.addService(this.Service.Switch, name, 'switch' + chan)
          accessory.getService(name).updateCharacteristic(this.Characteristic.On, false)
          accessory.getService(name).getCharacteristic(this.Characteristic.On)
            .on('set', (value, callback) => this.internalUpdate(chan, name, value, callback))
        })
        break
    }
  }

  async internalUpdate (rfChl, service, value, callback) {
    callback()
    try {
      if (!value) return
      const params = {
        cmd: 'transmit',
        rfChl: parseInt(rfChl)
      }
      const rfService = this.accessory.getService(service)
      rfService.updateCharacteristic(this.Characteristic.On, true)
      await helpers.sleep(1000)
      rfService.updateCharacteristic(this.Characteristic.On, false)
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!helpers.hasProperty(params, 'updateSource')) return
      const timeNow = new Date()
      let oAccessory = false
      if (helpers.hasProperty(params, 'cmd') && params.cmd === 'transmit' && helpers.hasProperty(params, 'rfChl')) {
        this.platform.devicesInHB.forEach(acc => {
          if (
            acc.context.eweDeviceId === this.accessory.context.eweDeviceId &&
            helpers.hasProperty(acc.context, 'buttons') &&
            helpers.hasProperty(acc.context.buttons, params.rfChl.toString())
          ) {
            oAccessory = acc
          }
        })
        if (oAccessory) {
          oAccessory.getService(oAccessory.context.buttons[params.rfChl]).updateCharacteristic(this.Characteristic.On, 1)
          helpers.sleep(3000)
          oAccessory.getService(oAccessory.context.buttons[params.rfChl]).updateCharacteristic(this.Characteristic.On, 0)
        } else {
          throw new Error('rf button not found in Homebridge')
        }
      } else if (helpers.hasProperty(params, 'cmd') && params.cmd === 'trigger') {
        //* ** RF Sensor ***\\
        Object.keys(params)
          .filter(name => /rfTrig/.test(name))
          .forEach(async chan => {
            this.platform.devicesInHB.forEach(acc => {
              if (
                acc.context.eweDeviceId === this.accessory.context.eweDeviceId &&
                helpers.hasProperty(acc.context, 'buttons') &&
                helpers.hasProperty(acc.context.buttons, chan.substr(-1).toString())
              ) {
                oAccessory = acc
              }
            })
            if (oAccessory) {
              const timeOfMotion = new Date(params[chan])
              const diff = (timeNow.getTime() - timeOfMotion.getTime()) / 1000
              let serv
              let char
              if (diff < (this.platform.config.sensorTimeDifference || 120)) {
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
                    char = this.Characteristic.LeakDetected
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
                await helpers.sleep((this.platform.config.sensorTimeLength || 2) * 1000)
                oAccessory.getService(serv).updateCharacteristic(char, 0)
              }
            }
          })
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
