/* jshint node: true,esversion: 9, -W014, -W033 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceRFBridge {
  constructor (platform, accessory, devicesInHB) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.devicesInHB = devicesInHB
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.eveChar = platform.eveChar
    this.funcs = platform.funcs
    this.hapChar = platform.api.hap.Characteristic
    this.hapErr = platform.api.hap.HapStatusError
    this.hapServ = platform.api.hap.Service
    this.lang = platform.lang
    this.log = platform.log
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Initially set the online flag as true (to be then updated as false if necessary)
    this.isOnline = true

    // Set up custom variables for this device type
    const deviceConf = platform.deviceConf[accessory.context.eweDeviceId]
    const resetOnStartup = deviceConf && deviceConf.resetOnStartup

    // Set the correct logging variables for this accessory
    this.enableLogging = !platform.config.disableDeviceLogging
    this.enableDebugLogging = platform.config.debug
    if (deviceConf && deviceConf.overrideLogging) {
      switch (deviceConf.overrideLogging) {
        case 'standard':
          this.enableLogging = true
          this.enableDebugLogging = false
          break
        case 'debug':
          this.enableLogging = true
          this.enableDebugLogging = true
          break
        case 'disable':
          this.enableLogging = false
          this.enableDebugLogging = false
          break
      }
    }

    // Output the customised options to the log
    const opts = JSON.stringify({
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable',
      resetOnStartup
    })
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
  }

  async externalUpdate (params) {
    try {
      if (!this.funcs.hasProperty(params, 'updateSource')) {
        return
      }
      const timeNow = new Date()
      let subAccessory = false
      let channel
      if (
        this.funcs.hasProperty(params, 'cmd') &&
        params.cmd === 'transmit' &&
        this.funcs.hasProperty(params, 'rfChl')
      ) {
        // RF Button
        this.devicesInHB.forEach(acc => {
          if (
            acc.context.eweDeviceId === this.accessory.context.eweDeviceId &&
            this.funcs.hasProperty(acc.context, 'buttons') &&
            this.funcs.hasProperty(acc.context.buttons, params.rfChl.toString())
          ) {
            subAccessory = acc
          }
        })
        if (subAccessory) {
          const deviceConf = this.platform.rfSubdevices[subAccessory.context.hbDeviceId]
          let enableLogging = !this.disableDeviceLogging
          if (deviceConf && deviceConf.overrideLogging) {
            switch (deviceConf.overrideLogging) {
              case 'standard':
              case 'debug':
                enableLogging = true
                break
              case 'disable':
                enableLogging = false
                break
            }
          }
          const service = subAccessory.context.buttons[params.rfChl]
          subAccessory.getService(service).updateCharacteristic(this.hapChar.On, true)
          if (params.updateSource && enableLogging) {
            this.log(
              '[%s] %s [%s].',
              subAccessory.displayName,
              this.lang.curState,
              this.lang.buttonTrig
            )
          }
          await this.funcs.sleep(3000)
          subAccessory.getService(service).updateCharacteristic(this.hapChar.On, false)
        } else {
          throw new Error(this.lang.buttonNotFound)
        }
      } else if (
        (this.funcs.hasProperty(params, 'cmd') && params.cmd === 'trigger') ||
        params.updateSource === 'LAN'
      ) {
        // RF Sensor
        Object.keys(params)
          .filter(name => /rfTrig/.test(name))
          .forEach(async chan => {
            this.devicesInHB.forEach(acc => {
              if (
                acc.context.eweDeviceId === this.accessory.context.eweDeviceId &&
                this.funcs.hasProperty(acc.context, 'buttons') &&
                this.funcs.hasProperty(acc.context.buttons, chan.split('g')[1].toString())
              ) {
                subAccessory = acc
                channel = chan.split('g')[1].toString()
              }
            })
            if (subAccessory) {
              // Avoid duplicate triggers from LAN and WS
              if (params[chan] === subAccessory.context.cacheLastAct) {
                return
              }
              const deviceConf = this.platform.rfSubdevices[subAccessory.context.hbDeviceId] || {}
              let enableLogging = !this.disableDeviceLogging
              if (deviceConf && deviceConf.overrideLogging) {
                switch (deviceConf.overrideLogging) {
                  case 'standard':
                  case 'debug':
                    enableLogging = true
                    break
                  case 'disable':
                    enableLogging = false
                    break
                }
              }
              switch (subAccessory.context.subType) {
                case 'blind':
                  // Simulation
                  return
                case 'button':
                case 'curtain': {
                  const service = subAccessory.context.buttons[channel]
                  subAccessory.getService(service).updateCharacteristic(this.hapChar.On, true)
                  this.log(
                    '[%s] %s [%s].',
                    subAccessory.displayName,
                    this.lang.curState,
                    this.lang.buttonTrig
                  )
                  await this.funcs.sleep(3000)
                  subAccessory.getService(service).updateCharacteristic(this.hapChar.On, false)
                  return
                }
              }
              const sensorTimeLength =
                deviceConf.sensorTimeLength || this.consts.defaultValues.sensorTimeLength
              const sensorTimeDifference =
                deviceConf.sensorTimeDifference || this.consts.defaultValues.sensorTimeDifference
              subAccessory.context.cacheLastAct = params[chan]
              const timeOfMotion = new Date(params[chan])
              const diff = (timeNow.getTime() - timeOfMotion.getTime()) / 1000
              let serv
              let char
              if (diff < sensorTimeDifference) {
                switch (deviceConf.type) {
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
                    subAccessory
                      .getService(serv)
                      .updateCharacteristic(
                        this.eveChar.LastActivation,
                        Math.round(new Date().valueOf() / 1000) - initialTime
                      )
                    break
                  }
                  case 'occupancy':
                    serv = this.hapServ.OccupancySensor
                    char = this.hapChar.OccupancyDetected
                    break
                  case 'p_button':
                    serv = this.hapServ.StatelessProgrammableSwitch
                    char = this.hapChar.ProgrammableSwitchEvent
                    break
                  case 'doorbell':
                    serv = this.hapServ.Doorbell
                    char = this.hapChar.ProgrammableSwitchEvent
                    break
                  default: {
                    serv = this.hapServ.MotionSensor
                    char = this.hapChar.MotionDetected
                    const initialTime = subAccessory.eveService.getInitialTime()
                    subAccessory
                      .getService(serv)
                      .updateCharacteristic(
                        this.eveChar.LastActivation,
                        Math.round(new Date().valueOf() / 1000) - initialTime
                      )
                    break
                  }
                }

                // Programmable button and doorbell activate differently
                if (char === this.hapChar.ProgrammableSwitchEvent) {
                  subAccessory.getService(serv).updateCharacteristic(char, 0)
                  if (params.updateSource && enableLogging) {
                    this.log(
                      '[%s] %s [%s].',
                      subAccessory.displayName,
                      this.lang.curState,
                      this.lang.buttonSingle
                    )
                  }
                  return
                } else {
                  subAccessory.getService(serv).updateCharacteristic(char, 1)
                  subAccessory.eveService.addEntry({ status: 1 })
                  if (params.updateSource && enableLogging) {
                    this.log(
                      '[%s] %s [%s].',
                      subAccessory.displayName,
                      this.lang.curState,
                      this.lang.rfTrigYes
                    )
                  }
                }
                const updateKey = Math.random()
                  .toString(36)
                  .substr(2, 8)
                subAccessory.context.updateKey = updateKey
                await this.funcs.sleep(sensorTimeLength * 1000)
                if (updateKey !== subAccessory.context.updateKey) {
                  return
                }
                subAccessory.getService(serv).updateCharacteristic(char, 0)
                subAccessory.eveService.addEntry({ status: 0 })
                if (params.updateSource && enableLogging) {
                  this.log(
                    '[%s] %s [%s].',
                    subAccessory.displayName,
                    this.lang.curState,
                    this.lang.rfTrigNo
                  )
                }
              }
            } else {
              this.log.warn('[%s] %s [%s].', this.name, this.lang.rfNotFound, chan)
            }
          })
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
