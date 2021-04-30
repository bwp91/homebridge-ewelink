/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceRFBridge {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.eveChar = platform.eveChar
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // There are two types of RF sub types [curtains, buttons] and [sensors]
    if (['curtain', 'button'].includes(this.accessory.context.subType)) {
      // This instance is a remote control with buttons or curtain control
      Object.entries(this.accessory.context.buttons).forEach(([chan, name]) => {
        // For each curtain/button we create a separate switch service

        // Add the switch service if it doesn't already exist
        if (!this.accessory.getService(name)) {
          this.accessory.addService(this.hapServ.Switch, name, 'switch' + chan)
        }

        // Always start with the buttons off (useful when restarting Homebridge)
        this.accessory.getService(name).updateCharacteristic(this.hapChar.On, false)

        // Add the set handler to the switch on/off characteristic
        this.accessory.getService(name).getCharacteristic(this.hapChar.On)
          .onSet(async value => {
            await this.internalUpdate(chan, name, value)
          })
      })
    } else {
      // This instance is a sensor which the user can define as different types
      let serv
      let char
      let eveType
      let addLACharacteristic = false

      // Check which type this sensor is and get the correct service/characteristic
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
          addLACharacteristic = true
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
          addLACharacteristic = true
          break
      }

      // Add the sensor if it doesn't already exist
      let service
      if (!(service = this.accessory.getService(serv))) {
        service = this.accessory.addService(serv)
        if (addLACharacteristic) {
          service.addCharacteristic(this.eveChar.LastActivation)
        }
      }

      // Always start with the sensor off (useful when restarting Homebridge)
      service.updateCharacteristic(char, 0)

      // Pass the accessory to Fakegato to set up with Eve
      this.accessory.eveService = new this.platform.eveService(eveType, this.accessory, {
        log: platform.config.debugFakegato ? this.log : () => {}
      })
    }
  }

  async internalUpdate (rfChl, service, value) {
    try {
      if (!value) {
        return
      }
      const params = {
        cmd: 'transmit',
        rfChl: parseInt(rfChl)
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.log(
        '[%s] %s [%s].',
        this.name,
        this.messages.curState,
        this.messages.buttonTrig
      )
      setTimeout(() => {
        this.accessory.getService(service).updateCharacteristic(this.hapChar.On, false)
      }, 1000)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.accessory.getService(service).updateCharacteristic(this.hapChar.On, false)
      }, 5000)
      throw new this.platform.api.hap.HapStatusError(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (!this.funcs.hasProperty(params, 'updateSource')) {
        return
      }
      const timeNow = new Date()
      let subAccessory = false
      if (
        this.funcs.hasProperty(params, 'cmd') &&
        params.cmd === 'transmit' &&
        this.funcs.hasProperty(params, 'rfChl')
      ) {
        this.platform.devicesInHB.forEach(acc => {
          if (
            acc.context.eweDeviceId === this.accessory.context.eweDeviceId &&
            this.funcs.hasProperty(acc.context, 'buttons') &&
            this.funcs.hasProperty(acc.context.buttons, params.rfChl.toString())
          ) {
            subAccessory = acc
          }
        })
        if (subAccessory) {
          subAccessory.getService(subAccessory.context.buttons[params.rfChl])
            .updateCharacteristic(this.hapChar.On, 1)
          if (params.updateSource && !subAccessory.context.disableDeviceLogging) {
            this.log(
              '[%s] %s [%s].',
              subAccessory.displayName,
              this.messages.curState,
              this.messages.buttonTrig
            )
          }
          this.funcs.sleep(3000)
          subAccessory.getService(subAccessory.context.buttons[params.rfChl])
            .updateCharacteristic(this.hapChar.On, 0)
        } else {
          throw new Error(this.messages.buttonNotFound)
        }
      } else if (
        (this.funcs.hasProperty(params, 'cmd') && params.cmd === 'trigger') ||
        params.updateSource === 'LAN'
      ) {
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
                subAccessory = acc
              }
            })
            if (subAccessory) {
              // Avoid duplicate triggers from LAN and WS
              if (params[chan] === subAccessory.context.cacheLastAct) {
                return
              }

              subAccessory.context.cacheLastAct = params[chan]
              const timeOfMotion = new Date(params[chan])
              const diff = (timeNow.getTime() - timeOfMotion.getTime()) / 1000
              let serv
              let char
              if (
                diff < subAccessory.context.sensorTimeDiff ||
                ['button', 'curtain'].includes(subAccessory.context.subType)
              ) {
                switch (subAccessory.context.subType) {
                  case 'button':
                  case 'curtain':
                    this.log(
                      '[%s] %s [%s].',
                      subAccessory.displayName,
                      this.messages.curState,
                      this.messages.buttonTrig
                    )
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
                  case 'contact': {
                    serv = this.hapServ.ContactSensor
                    char = this.hapChar.ContactSensorState
                    const initialTime = subAccessory.eveService.getInitialTime()
                    subAccessory.getService(serv).updateCharacteristic(
                      this.eveChar.LastActivation,
                      Math.round(new Date().valueOf() / 1000) - initialTime
                    )
                    break
                  }
                  case 'occupancy':
                    serv = this.hapServ.OccupancySensor
                    char = this.hapChar.OccupancyDetected
                    break
                  default: {
                    serv = this.hapServ.MotionSensor
                    char = this.hapChar.MotionDetected
                    const initialTime = subAccessory.eveService.getInitialTime()
                    subAccessory.getService(serv).updateCharacteristic(
                      this.eveChar.LastActivation,
                      Math.round(new Date().valueOf() / 1000) - initialTime
                    )
                    break
                  }
                }
                subAccessory.getService(serv).updateCharacteristic(char, 1)
                subAccessory.eveService.addEntry({ status: 1 })
                if (params.updateSource && !subAccessory.context.disableDeviceLogging) {
                  this.log(
                    '[%s] %s [%s].',
                    subAccessory.displayName,
                    this.messages.curState,
                    this.messages.rfTrigYes
                  )
                }
                const updateKey = Math.random().toString(36).substr(2, 8)
                subAccessory.context.updateKey = updateKey
                await this.funcs.sleep(subAccessory.context.sensorTimeLength * 1000)
                if (updateKey !== subAccessory.context.updateKey) {
                  return
                }
                subAccessory.getService(serv).updateCharacteristic(char, 0)
                subAccessory.eveService.addEntry({ status: 0 })
                if (params.updateSource && !subAccessory.context.disableDeviceLogging) {
                  this.log(
                    '[%s] %s [%s].',
                    subAccessory.displayName,
                    this.messages.curState,
                    this.messages.rfTrigNo
                  )
                }
              }
            } else {
              this.log.warn('[%s] %s [%s].', this.name, this.messages.rfNotFound, chan)
            }
          })
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
