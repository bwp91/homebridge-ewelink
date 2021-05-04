/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceGarageEachen {
  constructor (platform, accessory) {
    // Set up variables from the platform
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

    // Set up custom variables for this device type
    const deviceConf = platform.simulations[accessory.context.eweDeviceId]
    this.operationTime = deviceConf.operationTime ||
      platform.consts.defaultValues.operationTime
    this.disableDeviceLogging = deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // If the accessory has a switch service then remove it
    if (this.accessory.getService(this.hapServ.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
    }

    // If the accessory has a contact sensor service then remove it
    if (this.accessory.getService(this.hapServ.ContactSensor)) {
      this.accessory.removeService(
        this.accessory.getService(this.hapServ.ContactSensor)
      )
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
      this.internalStateUpdate(value)
    })

    // Update the obstruction detected to false on Homebridge restart
    this.service.updateCharacteristic(this.hapChar.ObstructionDetected, false)

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('door', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log if in debug mode
    if (platform.config.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        operationTime: this.operationTime,
        type: deviceConf.type
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async internalStateUpdate (value) {
    try {
      const params = { switch: value === 0 ? 'on' : 'off' }
      const curState = this.service.getCharacteristic(this.hapChar.CurrentDoorState).value
      if (value === curState % 2) {
        return
      }
      this.inUse = true
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.service.updateCharacteristic(this.hapChar.TargetDoorState, value)
      this.service.updateCharacteristic(this.hapChar.CurrentDoorState, value + 2)
      await this.funcs.sleep(2000)
      this.inUse = false
      if (value === 0) {
        this.service.updateCharacteristic(this.hapChar.ContactSensorState, 1)
        this.accessory.eveService.addEntry({ status: 0 })
        const initialTime = this.accessory.eveService.getInitialTime()
        this.service.updateCharacteristic(
          this.eveChar.LastActivation,
          Math.round(new Date().valueOf() / 1000) - initialTime
        )
        this.timesOpened++
        this.service.updateCharacteristic(this.eveChar.TimesOpened, this.timesOpened)
        await this.funcs.sleep(Math.max((this.operationTime - 20) * 100, 0))
        this.service.updateCharacteristic(this.hapChar.CurrentDoorState, 0)
        if (!this.disableDeviceLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curState, this.lang.doorOpen)
        }
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(
          this.hapChar.TargetPosition,
          this.accessory.context.cacheTargetPosition
        )
      }, 5000)
      this.service.updateCharacteristic(
        this.hapChar.TargetPosition,
        new this.hapErr(-70402)
      )
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switch || this.inUse) {
        return
      }
      this.service.updateCharacteristic(
        this.hapChar.TargetDoorState,
        params.switch === 'on' ? 0 : 1
      )
      this.service.updateCharacteristic(
        this.hapChar.CurrentDoorState,
        params.switch === 'on' ? 0 : 1
      )
      if (params.switch === 'on') {
        this.service.updateCharacteristic(this.hapChar.ContactSensorState, 1)
        this.accessory.eveService.addEntry({ status: 0 })
        const initialTime = this.accessory.eveService.getInitialTime()
        this.service.updateCharacteristic(
          this.eveChar.LastActivation,
          Math.round(new Date().valueOf() / 1000) - initialTime
        )
        this.timesOpened++
        this.service.updateCharacteristic(
          this.eveChar.TimesOpened,
          this.timesOpened
        )
      } else {
        this.service.updateCharacteristic(this.hapChar.ContactSensorState, 0)
        this.accessory.eveService.addEntry({ status: 1 }) // swapped
      }
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log(
          '[%s] %s [%s].',
          this.name,
          this.lang.curState,
          params.switch === 'on' ? this.lang.doorOpen : this.lang.doorClosed
        )
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
