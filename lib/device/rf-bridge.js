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
      let justAdded = false
      if (!(service = this.accessory.getService(serv))) {
        service = this.accessory.addService(serv)
        if (addLACharacteristic) {
          service.addCharacteristic(this.eveChar.LastActivation)
        }
        justAdded = true
      }

      // Always start with the sensor off (useful when restarting Homebridge)
      service.updateCharacteristic(char, 0)

      // Pass the accessory to Fakegato to set up with Eve
      this.accessory.eveService = new this.platform.eveService(eveType, this.accessory, {
        log: platform.config.debugFakegato ? this.log : () => {}
      })

      if (justAdded) {
        this.accessory.eveService.addEntry({ status: 0 })
      }
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
      this.log('[%s] current state [button triggered].', this.name)
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
      let oAccessory = false
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
            oAccessory = acc
          }
        })
        if (oAccessory) {
          oAccessory.getService(oAccessory.context.buttons[params.rfChl])
            .updateCharacteristic(this.hapChar.On, 1)
          if (params.updateSource && !oAccessory.context.disableDeviceLogging) {
            this.log('[%s] current state [button triggered].', oAccessory.displayName)
          }
          this.funcs.sleep(3000)
          oAccessory.getService(oAccessory.context.buttons[params.rfChl])
            .updateCharacteristic(this.hapChar.On, 0)
        } else {
          throw new Error('rf button not found (please restart Homebridge)')
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
                oAccessory = acc
              }
            })
            if (oAccessory) {
              // Avoid duplicate triggers from LAN and WS
              if (params[chan] === oAccessory.context.cacheLastAct) {
                return
              }

              oAccessory.context.cacheLastAct = params[chan]
              const timeOfMotion = new Date(params[chan])
              const diff = (timeNow.getTime() - timeOfMotion.getTime()) / 1000
              let serv
              let char
              if (
                diff < oAccessory.context.sensorTimeDiff ||
                ['button', 'curtain'].includes(oAccessory.context.subType)
              ) {
                switch (oAccessory.context.subType) {
                  case 'button':
                  case 'curtain':
                    this.log(
                      '[%s] current state [button triggered].',
                      oAccessory.displayName
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
                    const initialTime = oAccessory.eveService.getInitialTime()
                    oAccessory.getService(serv).updateCharacteristic(
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
                    const initialTime = oAccessory.eveService.getInitialTime()
                    oAccessory.getService(serv).updateCharacteristic(
                      this.eveChar.LastActivation,
                      Math.round(new Date().valueOf() / 1000) - initialTime
                    )
                    break
                  }
                }
                oAccessory.getService(serv).updateCharacteristic(char, 1)
                oAccessory.eveService.addEntry({ status: 1 })
                if (params.updateSource && !oAccessory.context.disableDeviceLogging) {
                  this.log('[%s] current state [triggered].', oAccessory.displayName)
                }
                const updateKey = Math.random().toString(36).substr(2, 8)
                oAccessory.context.updateKey = updateKey
                await this.funcs.sleep(oAccessory.context.sensorTimeLength * 1000)
                if (updateKey !== oAccessory.context.updateKey) {
                  return
                }
                oAccessory.getService(serv).updateCharacteristic(char, 0)
                oAccessory.eveService.addEntry({ status: 0 })
                if (params.updateSource && !oAccessory.context.disableDeviceLogging) {
                  this.log('[%s] current state [not triggered].', oAccessory.displayName)
                }
              }
            } else {
              this.log.warn(
                '[%s] no accessory found for [%s], please try restarting Homebridge.',
                this.name,
                chan
              )
            }
          })
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
