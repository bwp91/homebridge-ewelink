/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceGarageOne {
  constructor (platform, accessory, devicesInHB) {
    // Set up variables from the platform
    this.eveChar = platform.eveChar
    this.funcs = platform.funcs
    this.hapChar = platform.api.hap.Characteristic
    this.hapErr = platform.api.hap.HapStatusError
    this.hapServ = platform.api.hap.Service
    this.hapUUIDGen = platform.api.hap.uuid.generate
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
    this.operationTimeUp = deviceConf.operationTime || platform.consts.defaultValues.operationTime
    this.operationTimeDown = deviceConf.operationTimeDown || this.operationTimeUp

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

    // Check the sensor is valid if defined by the user
    if (deviceConf.sensorId) {
      this.definedSensor = true
    }

    // If the accessory has a switch service then remove it
    if (this.accessory.getService(this.hapServ.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
    }

    // If the accessory has a contact sensor service then remove it
    if (this.accessory.getService(this.hapServ.ContactSensor)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.ContactSensor))
    }

    // Add the garage door service if it doesn't already exist
    if (!(this.service = this.accessory.getService(this.hapServ.GarageDoorOpener))) {
      this.service = this.accessory.addService(this.hapServ.GarageDoorOpener)
      this.service.updateCharacteristic(this.hapChar.CurrentDoorState, 1)
      this.service.updateCharacteristic(this.hapChar.TargetDoorState, 1)
      this.service.updateCharacteristic(this.hapChar.ObstructionDetected, false)
      this.service.addCharacteristic(this.eveChar.LastActivation)
      this.service.addCharacteristic(this.eveChar.ResetTotal)
      this.service.addCharacteristic(this.eveChar.TimesOpened)
    }

    // Remove unneeded characteristics
    if (this.service.testCharacteristic(this.hapChar.ContactSensorState)) {
      this.service.removeCharacteristic(
        this.service.getCharacteristic(this.hapChar.ContactSensorState)
      )
    }
    if (this.service.testCharacteristic(this.hapChar.OpenDuration)) {
      this.service.removeCharacteristic(this.service.getCharacteristic(this.hapChar.OpenDuration))
    }
    if (this.service.testCharacteristic(this.hapChar.ClosedDuration)) {
      this.service.removeCharacteristic(this.service.getCharacteristic(this.hapChar.ClosedDuration))
    }

    // Set up the device type and power readings if necessary
    if (platform.consts.devices.singleSwitch.includes(this.accessory.context.eweUIID)) {
      this.setup = 'singleSwitch'
    } else if (platform.consts.devices.outlet.includes(this.accessory.context.eweUIID)) {
      this.setup = 'singleSwitch'

      // Add Eve power characteristics
      this.powerReadings = true
      if (!this.service.testCharacteristic(this.eveChar.CurrentConsumption)) {
        this.service.addCharacteristic(this.eveChar.CurrentConsumption)
      }
      if (this.accessory.context.eweUIID === 32) {
        if (!this.service.testCharacteristic(this.eveChar.ElectricCurrent)) {
          this.service.addCharacteristic(this.eveChar.ElectricCurrent)
        }
        if (!this.service.testCharacteristic(this.eveChar.Voltage)) {
          this.service.addCharacteristic(this.eveChar.Voltage)
        }
      }
    } else if (platform.consts.devices.multiSwitch.includes(this.accessory.context.eweUIID)) {
      this.setup = 'multiSwitch'
      if (this.accessory.context.eweUIID === 126) {
        // Add Eve power characteristics
        this.powerReadings = true
        if (!this.service.testCharacteristic(this.eveChar.CurrentConsumption)) {
          this.service.addCharacteristic(this.eveChar.CurrentConsumption)
        }
        if (!this.service.testCharacteristic(this.eveChar.ElectricCurrent)) {
          this.service.addCharacteristic(this.eveChar.ElectricCurrent)
        }
        if (!this.service.testCharacteristic(this.eveChar.Voltage)) {
          this.service.addCharacteristic(this.eveChar.Voltage)
        }
        this.isDualR3 = true
      }
    } else if (platform.consts.devices.outletSCM.includes(this.accessory.context.eweUIID)) {
      this.setup = 'multiSwitch'
    }

    // Add the set handler to the garage door reset total characteristic
    this.service.getCharacteristic(this.eveChar.ResetTotal).onSet(value => {
      this.service.updateCharacteristic(this.eveChar.TimesOpened, 0)
    })

    // Add the set handler to the target position characteristic
    this.service.getCharacteristic(this.hapChar.TargetDoorState).onSet(value => {
      // We don't use await as we want the callback to be run straight away
      this.internalUpdate(value)
    })

    // Add the get handlers only if the user has configured the offlineAsNoResponse setting
    if (platform.config.offlineAsNoResponse) {
      this.service.getCharacteristic(this.hapChar.CurrentDoorState).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.CurrentDoorState).value
      })
      this.service.getCharacteristic(this.hapChar.TargetDoorState).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.TargetDoorState).value
      })
    }

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('door', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Set up an interval to get eWeLink to send power updates
    if (
      this.powerReadings &&
      (!this.isDualR3 || (this.isDualR3 && platform.config.mode !== 'lan'))
    ) {
      setTimeout(() => {
        this.internalUIUpdate()
        this.intervalPoll = setInterval(() => this.internalUIUpdate(), 120000)
      }, 5000)

      // Stop the intervals on Homebridge shutdown
      platform.api.on('shutdown', () => {
        clearInterval(this.intervalPoll)
      })
    }

    // Output the customised options to the log
    const opts = JSON.stringify({
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable',
      operationTimeDown: this.operationTimeDown,
      operationTimeUp: this.operationTimeUp,
      showAs: 'garage'
    })
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
  }

  async internalUpdate (value) {
    try {
      const newPos = value
      const params = {}
      let delay = 0
      const prevState = this.service.getCharacteristic(this.hapChar.CurrentDoorState).value
      if (newPos === prevState % 2) {
        return
      }
      this.inUse = true
      this.cacheState = value
      if (this.setup === 'singleSwitch' && [2, 3].includes(prevState)) {
        this.service.updateCharacteristic(this.hapChar.CurrentDoorState, ((prevState * 2) % 3) + 2)
        delay = 1500
      }
      if (this.cacheState !== newPos) {
        return
      }
      await this.funcs.sleep(delay)
      this.service.updateCharacteristic(this.hapChar.TargetDoorState, newPos)
      this.service.updateCharacteristic(this.hapChar.CurrentDoorState, newPos + 2)
      switch (this.setup) {
        case 'singleSwitch':
          params.switch = 'on'
          break
        case 'multiSwitch':
          params.switches = [
            {
              switch: newPos === 0 ? 'on' : 'off',
              outlet: 0
            },
            {
              switch: newPos === 1 ? 'on' : 'off',
              outlet: 1
            }
          ]
          break
        default:
          return
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      await this.funcs.sleep(2000)
      this.inUse = false
      if (!this.definedSensor && newPos === 0) {
        this.accessory.eveService.addEntry({ status: 0 })
        const initialTime = this.accessory.eveService.getInitialTime()
        this.service.updateCharacteristic(
          this.eveChar.LastActivation,
          Math.round(new Date().valueOf() / 1000) - initialTime
        )
        const newTO = this.service.getCharacteristic(this.eveChar.TimesOpened).value + 1
        this.service.updateCharacteristic(this.eveChar.TimesOpened, newTO)
      }
      const operationTime = newPos === 0 ? this.operationTimeUp : this.operationTimeDown
      await this.funcs.sleep(Math.max((operationTime - 20) * 100, 0))
      if (!this.definedSensor) {
        this.service.updateCharacteristic(this.hapChar.CurrentDoorState, newPos)
        if (newPos === 1) {
          this.accessory.eveService.addEntry({ status: 1 })
        }
        if (this.enableLogging) {
          this.log(
            '[%s] %s [%s].',
            this.name,
            this.lang.curState,
            newPos === 0 ? this.lang.doorOpen : this.lang.doorClosed
          )
        }
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(
          this.hapChar.TargetPosition,
          this.service.getCharacteristic(this.hapChar.TargetPosition).value
        )
      }, 2000)
      this.service.updateCharacteristic(this.hapChar.TargetPosition, new this.hapErr(-70402))
    }
  }

  async internalUIUpdate () {
    try {
      // Skip polling if device isn't online
      if (!this.isOnline) {
        return
      }

      // Send the params to request the updates
      if (this.isDualR3) {
        await this.platform.sendDeviceUpdate(this.accessory, { uiActive: { outlet: 0, time: 120 } })
      } else {
        await this.platform.sendDeviceUpdate(this.accessory, { uiActive: 120 })
      }
    } catch (err) {
      // Suppress errors here
    }
  }

  async externalUpdate (params) {
    try {
      if (this.powerReadings) {
        let logger = false
        let power
        let voltage
        let current
        if (this.funcs.hasProperty(params, 'actPow_00')) {
          power = parseInt(params.actPow_00) / 100
          this.service.updateCharacteristic(this.eveChar.CurrentConsumption, power)
          logger = true
        } else if (this.funcs.hasProperty(params, 'power')) {
          power = parseFloat(params.power)
          this.service.updateCharacteristic(this.eveChar.CurrentConsumption, power)
          logger = true
        }
        if (this.funcs.hasProperty(params, 'voltage_00')) {
          voltage = parseInt(params.voltage_00) / 100
          this.service.updateCharacteristic(this.eveChar.Voltage, voltage)
          logger = true
        } else if (this.funcs.hasProperty(params, 'voltage')) {
          voltage = parseFloat(params.voltage)
          this.service.updateCharacteristic(this.eveChar.Voltage, voltage)
          logger = true
        }
        if (this.funcs.hasProperty(params, 'current_00')) {
          current = parseInt(params.current_00) / 100
          this.service.updateCharacteristic(this.eveChar.ElectricCurrent, current)
          logger = true
        } else if (this.funcs.hasProperty(params, 'current')) {
          current = parseFloat(params.current)
          this.service.updateCharacteristic(this.eveChar.ElectricCurrent, current)
          logger = true
        }
        if (params.updateSource && logger && this.enableLogging) {
          this.log(
            '[%s] %s%s%s.',
            this.name,
            power !== undefined ? this.lang.curPower + ' [' + power + 'W]' : '',
            voltage !== undefined ? ' ' + this.lang.curVolt + ' [' + voltage + 'V]' : '',
            current !== undefined ? ' ' + this.lang.curCurr + ' [' + current + 'A]' : ''
          )
        }
      }

      if (!this.inUse && !this.definedSensor) {
        const prevState = this.service.getCharacteristic(this.hapChar.CurrentDoorState).value
        const newPos = [0, 2].includes(prevState) ? 3 : 2
        if (this.setup === 'multiSwitch' && params.switches) {
          if (
            params.switches[0].switch === params.switches[1].switch ||
            params.switches[prevState % 2].switch === 'on'
          ) {
            return
          }
        } else if (this.setup === 'singleSwitch' && params.switch) {
          if (params.switch === 'off') {
            return
          }
        } else {
          return
        }
        this.inUse = true
        this.service.updateCharacteristic(this.hapChar.TargetDoorState, newPos - 2)
        this.service.updateCharacteristic(this.hapChar.CurrentDoorState, newPos)
        await this.funcs.sleep(2000)
        this.inUse = false
        if (newPos === 2) {
          this.accessory.eveService.addEntry({ status: 0 })
          const initialTime = this.accessory.eveService.getInitialTime()
          this.service.updateCharacteristic(
            this.eveChar.LastActivation,
            Math.round(new Date().valueOf() / 1000) - initialTime
          )
          const newTO = this.service.getCharacteristic(this.eveChar.TimesOpened).value + 1
          this.service.updateCharacteristic(this.eveChar.TimesOpened, newTO)
        }
        const operationTime = newPos === 2 ? this.operationTimeUp : this.operationTimeDown
        await this.funcs.sleep(Math.max((operationTime - 20) * 100, 0))
        this.service.updateCharacteristic(this.hapChar.CurrentDoorState, newPos - 2)
        if (newPos === 3) {
          this.accessory.eveService.addEntry({ status: 1 })
        }
        if (this.enableLogging) {
          this.log(
            '[%s] %s [%s].',
            this.name,
            this.lang.curState,
            newPos === 2 ? this.lang.doorOpen : this.lang.doorClosed
          )
        }
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
