/* jshint -W014, -W033, esversion: 9 */
'use strict'
let Characteristic, Service
const utils = require('./../utils')
module.exports = class deviceRFBridge {
  constructor (platform, accessory) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
    switch (accessory.context.subType) {
      case 'water':
        if (!accessory.getService(Service.LeakSensor)) accessory.addService(Service.LeakSensor)
        break
      case 'fire':
      case 'smoke':
        if (!accessory.getService(Service.SmokeSensor)) accessory.addService(Service.SmokeSensor)
        break
      case 'co':
        if (!accessory.getService(Service.CarbonMonoxideSensor)) accessory.addService(Service.CarbonMonoxideSensor)
        break
      case 'co2':
        if (!accessory.getService(Service.CarbonDioxideSensor)) accessory.addService(Service.CarbonDioxideSensor)
        break
      case 'contact':
        if (!accessory.getService(Service.ContactSensor)) accessory.addService(Service.ContactSensor)
        break
      case 'occupancy':
        if (!accessory.getService(Service.OccupancySensor)) accessory.addService(Service.OccupancySensor)
        break
      default:
        if (!accessory.getService(Service.MotionSensor)) accessory.addService(Service.MotionSensor)
        break
      case 'button':
        Object.entries(accessory.context.buttons).forEach(([chan, name]) => {
          if (!accessory.getService(name)) accessory.addService(Service.Switch, name, 'switch' + chan)
          accessory.getService(name).updateCharacteristic(Characteristic.On, false)
          accessory.getService(name).getCharacteristic(Characteristic.On)
            .on('set', (value, callback) => this.internalUpdate(accessory, chan, name, value, callback))
        })
        break
    }
  }

  async internalUpdate (accessory, rfChl, service, value, callback) {
    callback()
    try {
      if (!value) return
      const params = {
        cmd: 'transmit',
        rfChl: parseInt(rfChl)
      }
      const rfService = accessory.getService(service)
      rfService.updateCharacteristic(Characteristic.On, true)
      await utils.sleep(1000)
      rfService.updateCharacteristic(Characteristic.On, false)
      await this.platform.sendDeviceUpdate(accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {
      if (!utils.hasProperty(params, 'updateSource')) return
      const timeNow = new Date()
      let oAccessory = false
      if (utils.hasProperty(params, 'cmd') && params.cmd === 'transmit' && utils.hasProperty(params, 'rfChl')) {
        this.platform.devicesInHB.forEach(acc => {
          if (
            acc.context.eweDeviceId === accessory.context.eweDeviceId &&
            utils.hasProperty(acc.context, 'buttons') &&
            utils.hasProperty(acc.context.buttons, params.rfChl.toString())
          ) {
            oAccessory = acc
          }
        })
        if (oAccessory) {
          oAccessory.getService(oAccessory.context.buttons[params.rfChl]).updateCharacteristic(Characteristic.On, 1)
          setTimeout(
            () =>
              oAccessory
                .getService(oAccessory.context.buttons[params.rfChl])
                .updateCharacteristic(Characteristic.On, 0),
            3000
          )
        } else {
          throw new Error('rf button not found in Homebridge')
        }
      } else if (utils.hasProperty(params, 'cmd') && params.cmd === 'trigger') {
        //* ** RF Sensor ***\\
        Object.keys(params)
          .filter(name => /rfTrig/.test(name))
          .forEach(async chan => {
            this.platform.devicesInHB.forEach(acc => {
              if (
                acc.context.eweDeviceId === accessory.context.eweDeviceId &&
                utils.hasProperty(acc.context, 'buttons') &&
                utils.hasProperty(acc.context.buttons, chan.substr(-1).toString())
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
                    serv = Service.LeakSensor
                    char = Characteristic.LeakDetected
                    break
                  case 'fire':
                  case 'smoke':
                    serv = Service.SmokeSensor
                    char = Characteristic.LeakDetected
                    break
                  case 'co':
                    serv = Service.CarbonMonoxideSensor
                    char = Characteristic.CarbonMonoxideDetected
                    break
                  case 'co2':
                    serv = Service.CarbonDioxideSensor
                    char = Characteristic.CarbonDioxideDetected
                    break
                  case 'contact':
                    serv = Service.ContactSensor
                    char = Characteristic.ContactSensorState
                    break
                  case 'occupancy':
                    serv = Service.OccupancySensor
                    char = Characteristic.OccupancyDetected
                    break
                  default:
                    serv = Service.MotionSensor
                    char = Characteristic.MotionDetected
                    break
                }
                oAccessory.getService(serv).updateCharacteristic(char, 1)
                await utils.sleep((this.platform.config.sensorTimeLength || 2) * 1000)
                oAccessory.getService(serv).updateCharacteristic(char, 0)
              }
            }
          })
      }
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
