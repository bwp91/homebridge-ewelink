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
        accessory.getService(Service.LeakSensor) || accessory.addService(Service.LeakSensor)
        break
      case 'fire':
      case 'smoke':
        accessory.getService(Service.SmokeSensor) || accessory.addService(Service.SmokeSensor)
        break
      case 'co':
        accessory.getService(Service.CarbonMonoxideSensor) || accessory.addService(Service.CarbonMonoxideSensor)
        break
      case 'co2':
        accessory.getService(Service.CarbonDioxideSensor) || accessory.addService(Service.CarbonDioxideSensor)
        break
      case 'contact':
        accessory.getService(Service.ContactSensor) || accessory.addService(Service.ContactSensor)
        break
      case 'occupancy':
        accessory.getService(Service.OccupancySensor) || accessory.addService(Service.OccupancySensor)
        break
      default:
        accessory.getService(Service.MotionSensor) || accessory.addService(Service.MotionSensor)
        break
      case 'button':
        Object.entries(accessory.context.buttons).forEach(([chan, name]) => {
          accessory.getService(name) || accessory.addService(Service.Switch, name, 'switch' + chan)
          accessory.getService(name).updateCharacteristic(Characteristic.On, false)
          accessory.getService(name).getCharacteristic(Characteristic.On)
            .on('set', (value, callback) => {
              value ? this.internalUpdate(accessory, chan, name, callback) : callback()
            })
        })
        break
    }
  }

  async internalUpdate (accessory, rfChl, service, callback) {
    callback()
    try {
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

  externalUpdate (accessory, params) {
    try {
      if (!Object.prototype.hasOwnProperty.call(params, 'updateSource')) return
      const timeNow = new Date()
      let oAccessory = false
      if (Object.prototype.hasOwnProperty.call(params, 'cmd') && params.cmd === 'transmit' && Object.prototype.hasOwnProperty.call(params, 'rfChl')) {
        this.platform.devicesInHB.forEach(acc => {
          if (
            acc.context.eweDeviceId === accessory.context.eweDeviceId &&
            Object.prototype.hasOwnProperty.call(acc.context, 'buttons') &&
            Object.prototype.hasOwnProperty.call(acc.context.buttons, params.rfChl.toString())
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
      } else if (Object.prototype.hasOwnProperty.call(params, 'cmd') && params.cmd === 'trigger') {
        //* ** RF Sensor ***\\
        Object.keys(params)
          .filter(name => /rfTrig/.test(name))
          .forEach(chan => {
            this.platform.devicesInHB.forEach(acc => {
              if (
                acc.context.eweDeviceId === accessory.context.eweDeviceId &&
                Object.prototype.hasOwnProperty.call(acc.context, 'buttons') &&
                Object.prototype.hasOwnProperty.call(acc.context.buttons, chan.substr(-1).toString())
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
                setTimeout(() => {
                  oAccessory.getService(serv).updateCharacteristic(char, 0)
                }, (this.platform.config.sensorTimeLength || 2) * 1000)
              }
            }
          })
      }
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
