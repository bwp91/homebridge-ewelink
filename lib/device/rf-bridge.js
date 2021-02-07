/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceRFBridge {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    this.inherits = require('util').inherits
    const self = this
    this.eveLastActivation = function () {
      self.hapChar.call(this, 'Last Activation', self.consts.eveUUID.lastActivation)
      this.setProps({
        format: self.hapChar.Formats.UINT32,
        unit: self.hapChar.Units.SECONDS,
        perms: [self.hapChar.Perms.READ, self.hapChar.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.inherits(this.eveLastActivation, this.hapChar)
    this.eveLastActivation.UUID = this.consts.eveUUID.lastActivation
    this.sensorTimeDifference = parseInt(this.platform.config.sensorTimeDifference)
    this.sensorTimeDifference = isNaN(this.sensorTimeDifference) || this.sensorTimeDifference < 10
      ? this.consts.defaultValues.sensorTimeDifference
      : this.sensorTimeDifference
    if (['curtain', 'button'].includes(this.accessory.context.subType)) {
      Object.entries(this.accessory.context.buttons).forEach(([chan, name]) => {
        if (!this.accessory.getService(name)) {
          this.accessory.addService(this.hapServ.Switch, name, 'switch' + chan)
        }
        this.accessory.getService(name).updateCharacteristic(this.hapChar.On, false)
        this.accessory.getService(name).getCharacteristic(this.hapChar.On)
          .on('set', (value, callback) => this.internalUpdate(chan, name, value, callback))
      })
    } else {
      let serv
      let char
      let eveType
      switch (this.accessory.context.subType) {
        case 'water':
          serv = this.hapServ.LeakSensor
          char = this.hapChar.LeakDetected
          eveType = 'motion'
          break
        case 'fire':
        case 'smoke':
          serv = this.hapServ.SmokeSensor
          char = this.hapChar.SmokeDetected
          eveType = 'motion'
          break
        case 'co':
          serv = this.hapServ.CarbonMonoxideSensor
          char = this.hapChar.CarbonMonoxideDetected
          eveType = 'motion'
          break
        case 'co2':
          serv = this.hapServ.CarbonDioxideSensor
          char = this.hapChar.CarbonDioxideDetected
          eveType = 'motion'
          break
        case 'contact':
          serv = this.hapServ.ContactSensor
          char = this.hapChar.ContactSensorState
          eveType = 'door'
          break
        case 'occupancy':
          serv = this.hapServ.OccupancySensor
          char = this.hapChar.OccupancyDetected
          eveType = 'motion'
          break
        default:
          serv = this.hapServ.MotionSensor
          char = this.hapChar.MotionDetected
          eveType = 'motion'
          break
      }
      const service = this.accessory.getService(serv) || this.accessory.addService(serv)
      service.updateCharacteristic(char, 0)
      this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
      this.accessory.historyService = new this.platform.eveService(eveType, this.accessory, {
        storage: 'fs',
        path: platform.eveLogPath
      })
    }
  }

  async internalUpdate (rfChl, service, value, callback) {
    try {
      callback()
      if (!value) {
        return
      }
      const params = {
        cmd: 'transmit',
        rfChl: parseInt(rfChl)
      }
      await this.funcs.sleep(1000)
      this.accessory.getService(service).updateCharacteristic(this.hapChar.On, false)
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!this.funcs.hasProperty(params, 'updateSource')) {
        return
      }
      const timeNow = new Date()
      let oAccessory = false
      if (this.funcs.hasProperty(params, 'cmd') && params.cmd === 'transmit' && this.funcs.hasProperty(params, 'rfChl')) {
        this.platform.devicesInHB.forEach(acc => {
          if (
            acc.context.eweDeviceId === this.accessory.context.eweDeviceId &&
            this.funcs.hasProperty(acc.context, 'buttons') &&
            this.funcs.hasProperty(acc.context.buttons, params.rfChl.toString())
          ) {
            oAccessory = acc
          }
        })
        if (oAccessory) {
          oAccessory.getService(oAccessory.context.buttons[params.rfChl]).updateCharacteristic(this.hapChar.On, 1)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current state [button triggered]', oAccessory.displayName)
          }
          this.funcs.sleep(3000)
          oAccessory.getService(oAccessory.context.buttons[params.rfChl]).updateCharacteristic(this.hapChar.On, 0)
        } else {
          throw new Error('rf button not found in Homebridge')
        }
      } else if (this.funcs.hasProperty(params, 'cmd') && params.cmd === 'trigger') {
        //* ** RF Sensor ***\\
        Object.keys(params)
          .filter(name => /rfTrig/.test(name))
          .forEach(async chan => {
            this.platform.devicesInHB.forEach(acc => {
              if (
                acc.context.eweDeviceId === this.accessory.context.eweDeviceId &&
                this.funcs.hasProperty(acc.context, 'buttons') &&
                this.funcs.hasProperty(acc.context.buttons, chan.split('g')[1].toString())
              ) {
                oAccessory = acc
              }
            })
            if (oAccessory) {
              const sensorTimeLengthPri = parseInt(oAccessory.context.sensorTimeLength)
              const sensorTimeLengthSec = parseInt(this.platform.config.sensorTimeLength)
              const sensorTimeLength = isNaN(sensorTimeLengthPri) || sensorTimeLengthPri < 0
                ? isNaN(sensorTimeLengthSec) || sensorTimeLengthSec < 0
                  ? this.consts.defaultValues.sensorTimeLength
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
                    serv = this.hapServ.LeakSensor
                    char = this.hapChar.LeakDetected
                    break
                  case 'fire':
                  case 'smoke':
                    serv = this.hapServ.SmokeSensor
                    char = this.hapChar.SmokeDetected
                    break
                  case 'co':
                    serv = this.hapServ.CarbonMonoxideSensor
                    char = this.hapChar.CarbonMonoxideDetected
                    break
                  case 'co2':
                    serv = this.hapServ.CarbonDioxideSensor
                    char = this.hapChar.CarbonDioxideDetected
                    break
                  case 'contact':
                    serv = this.hapServ.ContactSensor
                    char = this.hapChar.ContactSensorState
                    oAccessory.getService(serv).updateCharacteristic(
                      this.eveLastActivation,
                      Math.round(new Date().valueOf() / 1000) - oAccessory.historyService.getInitialTime()
                    )
                    break
                  case 'occupancy':
                    serv = this.hapServ.OccupancySensor
                    char = this.hapChar.OccupancyDetected
                    break
                  default:
                    serv = this.hapServ.MotionSensor
                    char = this.hapChar.MotionDetected
                    oAccessory.getService(serv).updateCharacteristic(
                      this.eveLastActivation,
                      Math.round(new Date().valueOf() / 1000) - oAccessory.historyService.getInitialTime()
                    )
                    break
                }
                oAccessory.getService(serv).updateCharacteristic(char, 1)
                oAccessory.historyService.addEntry({
                  time: Math.round(new Date().valueOf() / 1000),
                  status: 1
                })
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log('[%s] current state [triggered]', oAccessory.displayName)
                }
                await this.funcs.sleep(sensorTimeLength * 1000)
                oAccessory.getService(serv).updateCharacteristic(char, 0)
                oAccessory.historyService.addEntry({
                  time: Math.round(new Date().valueOf() / 1000),
                  status: 0
                })
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log('[%s] current state [not triggered]', oAccessory.displayName)
                }
              }
            }
          })
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
