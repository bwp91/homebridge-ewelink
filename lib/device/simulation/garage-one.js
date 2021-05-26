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

    // Set up custom variables for this device type
    const deviceConf = platform.simulations[accessory.context.eweDeviceId]
    this.setup = deviceConf.setup
    this.operationTimeUp = deviceConf.operationTime || platform.consts.defaultValues.operationTime
    this.operationTimeDown = deviceConf.operationTimeDown || this.operationTimeUp
    this.disableDeviceLogging = deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Check for a valid setup
    if (!platform.consts.allowed.setups.includes(this.setup)) {
      this.error = this.lang.simErrSetup
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
      this.service.setCharacteristic(this.hapChar.CurrentDoorState, 1)
      this.service.setCharacteristic(this.hapChar.TargetDoorState, 1)
      this.service.setCharacteristic(this.hapChar.ObstructionDetected, false)
      this.service.addCharacteristic(this.hapChar.ContactSensorState)
      this.service.addCharacteristic(this.eveChar.LastActivation)
      this.service.addCharacteristic(this.eveChar.ResetTotal)
      this.service.addCharacteristic(this.eveChar.OpenDuration)
      this.service.addCharacteristic(this.eveChar.ClosedDuration)
      this.service.addCharacteristic(this.eveChar.TimesOpened)
    }

    // Obtain the current times opened value
    this.timesOpened = this.service.getCharacteristic(this.eveChar.TimesOpened).value

    // Add the set handler to the garage door reset total characteristic
    this.service.getCharacteristic(this.eveChar.ResetTotal).onSet(value => {
      this.timesOpened = 0
      this.service.updateCharacteristic(this.eveChar.TimesOpened, 0)
    })

    // Add the set handler to the target position characteristic
    this.service.getCharacteristic(this.hapChar.TargetDoorState).onSet(value => {
      // We don't use await as we want the callback to be run straight away
      this.internalUpdate(value)
    })

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('door', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log if in debug mode
    if (platform.config.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        operationTimeDown: this.operationTimeDown,
        operationTimeUp: this.operationTimeUp,
        setup: this.setup,
        type: deviceConf.type
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async internalUpdate (value) {
    try {
      if (this.error) {
        throw new Error(this.lang.invalidConfig + ' - ' + this.error)
      }
      const newPos = value
      const params = {}
      let delay = 0
      const prevState = this.service.getCharacteristic(this.hapChar.CurrentDoorState).value
      if (newPos === prevState % 2) {
        return
      }
      this.inUse = true
      this.cacheState = value
      if (this.setup === 'oneSwitch' && [2, 3].includes(prevState)) {
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
        case 'oneSwitch':
          params.switch = 'on'
          break
        case 'twoSwitch':
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
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      await this.funcs.sleep(2000)
      this.inUse = false
      const operationTime = newPos === 0 ? this.operationTimeUp : this.operationTimeDown
      await this.funcs.sleep(Math.max((operationTime - 20) * 100, 0))
      if (!this.definedSensor) {
        this.service.updateCharacteristic(this.hapChar.CurrentDoorState, newPos)
        if (!this.disableDeviceLogging) {
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

  async externalUpdate (params) {
    try {
      if (this.error) {
        throw new Error(this.lang.invalidConfig + ' - ' + this.error)
      }
      if ((!params.switch && !params.switches) || this.inUse || this.definedSensor) {
        return
      }
      const prevState = this.service.getCharacteristic(this.hapChar.CurrentDoorState).value
      const newPos = [0, 2].includes(prevState) ? 3 : 2
      switch (this.setup) {
        case 'oneSwitch':
          if (params.switch === 'off') {
            return
          }
          break
        case 'twoSwitch':
          if (
            params.switches[0].switch === params.switches[1].switch ||
            params.switches[prevState % 2].switch === 'on'
          ) {
            return
          }
          break
      }
      this.inUse = true
      this.service.updateCharacteristic(this.hapChar.TargetDoorState, newPos - 2)
      this.service.updateCharacteristic(this.hapChar.CurrentDoorState, newPos)
      await this.funcs.sleep(2000)
      this.inUse = false
      const operationTime = newPos === 2 ? this.operationTimeUp : this.operationTimeDown
      await this.funcs.sleep(Math.max((operationTime - 20) * 100, 0))
      this.service.updateCharacteristic(this.hapChar.CurrentDoorState, newPos - 2)
      if (!this.disableDeviceLogging) {
        this.log(
          '[%s] %s [%s].',
          this.name,
          this.messages.curState,
          newPos === 2 ? this.lang.doorOpen : this.lang.doorClosed
        )
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
