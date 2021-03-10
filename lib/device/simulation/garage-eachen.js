/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceGarageEachen {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.simulations[deviceId]
    this.operationTime = deviceConf.operationTime ||
      this.consts.defaultValues.operationTime
    this.exposeContactSensor = deviceConf.exposeContactSensor || false
    this.disableDeviceLogging = deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Set up the custom Eve characteristics for this device type
    this.inherits = require('util').inherits
    const self = this
    this.eveLastActivation = function () {
      self.hapChar.call(this, 'Last Activation', self.consts.eve.lastActivation)
      this.setProps({
        format: self.hapChar.Formats.UINT32,
        unit: self.hapChar.Units.SECONDS,
        perms: [self.hapChar.Perms.READ, self.hapChar.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.eveResetTotal = function () {
      self.hapChar.call(this, 'Reset Total', self.consts.eve.resetTotal)
      this.setProps({
        format: self.hapChar.Formats.UINT32,
        unit: self.hapChar.Units.seconds,
        perms: [
          self.hapChar.Perms.READ,
          self.hapChar.Perms.NOTIFY,
          self.hapChar.Perms.WRITE
        ]
      })
      this.value = this.getDefaultValue()
    }
    this.eveOpenDuration = function () {
      self.hapChar.call(this, 'Open Duration', self.consts.eve.openDuration)
      this.setProps({
        format: self.hapChar.Formats.UINT32,
        unit: self.hapChar.Units.SECONDS,
        perms: [
          self.hapChar.Perms.READ,
          self.hapChar.Perms.NOTIFY,
          self.hapChar.Perms.WRITE
        ]
      })
      this.value = this.getDefaultValue()
    }
    this.eveClosedDuration = function () {
      self.hapChar.call(this, 'Closed Duration', self.consts.eve.closedDuration)
      this.setProps({
        format: self.hapChar.Formats.UINT32,
        unit: self.hapChar.Units.SECONDS,
        perms: [
          self.hapChar.Perms.READ,
          self.hapChar.Perms.NOTIFY,
          self.hapChar.Perms.WRITE
        ]
      })
      this.value = this.getDefaultValue()
    }
    this.eveTimesOpened = function () {
      self.hapChar.call(this, 'Times Opened', self.consts.eve.timesOpened)
      this.setProps({
        format: self.hapChar.Formats.UINT32,
        perms: [self.hapChar.Perms.READ, self.hapChar.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.inherits(this.eveLastActivation, this.hapChar)
    this.inherits(this.eveResetTotal, this.hapChar)
    this.inherits(this.eveOpenDuration, this.hapChar)
    this.inherits(this.eveClosedDuration, this.hapChar)
    this.inherits(this.eveTimesOpened, this.hapChar)
    this.eveLastActivation.UUID = this.consts.eve.lastActivation
    this.eveResetTotal.UUID = this.consts.eve.resetTotal
    this.eveOpenDuration.UUID = this.consts.eve.openDuration
    this.eveClosedDuration.UUID = this.consts.eve.closedDuration
    this.eveTimesOpened.UUID = this.consts.eve.timesOpened

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
        .setCharacteristic(this.hapChar.TargetDoorState, 1)
        .setCharacteristic(this.hapChar.ObstructionDetected, false)
    }

    // Add the Eve characteristics if they don't already exist
    if (!this.service.testCharacteristic(this.eveLastActivation)) {
      this.service.addCharacteristic(this.eveLastActivation)
    }
    if (!this.service.testCharacteristic(this.eveResetTotal)) {
      this.service.addCharacteristic(this.eveResetTotal)
    }
    if (!this.service.testCharacteristic(this.eveOpenDuration)) {
      this.service.addCharacteristic(this.eveOpenDuration)
    }
    if (!this.service.testCharacteristic(this.eveClosedDuration)) {
      this.service.addCharacteristic(this.eveClosedDuration)
    }
    if (!this.service.testCharacteristic(this.eveTimesOpened)) {
      this.service.addCharacteristic(this.eveTimesOpened)
    }
    this.timesOpened = this.service.getCharacteristic(this.eveTimesOpened).value
    this.service.getCharacteristic(this.eveResetTotal)
      .removeAllListeners('set')
      .on('set', (value, callback) => {
        callback()
        this.timesOpened = 0
        this.service.updateCharacteristic(this.eveTimesOpened, 0)
      })

    // Add the set handler to the target position characteristic
    this.service.getCharacteristic(this.hapChar.TargetDoorState)
      .on('set', this.internalUpdate.bind(this))

    // Update the obstruction detected to false on Homebridge restart
    this.service.updateCharacteristic(this.hapChar.ObstructionDetected, false)

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('door', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        exposeContactSensor: this.exposeContactSensor,
        operationTime: this.operationTime,
        type: deviceConf.type
      })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async internalUpdate (value, callback) {
    try {
      callback()
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
        if (this.exposeContactSensor) {
          this.service.updateCharacteristic(this.hapChar.ContactSensorState, 1)
          this.accessory.eveService.addEntry({ status: 0 })
          const initialTime = this.accessory.eveService.getInitialTime()
          this.service.updateCharacteristic(
            this.eveLastActivation,
            Math.round(new Date().valueOf() / 1000) - initialTime
          )
          this.timesOpened++
          this.service.updateCharacteristic(
            this.eveTimesOpened,
            this.timesOpened
          )
        }
        await this.funcs.sleep(Math.max((this.operationTime - 20) * 100, 0))
        this.service.updateCharacteristic(this.hapChar.CurrentDoorState, 0)
        if (!this.disableDeviceLogging) {
          this.log('[%s] current state [open].', this.name)
        }
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
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
      if (this.exposeContactSensor) {
        if (params.switch === 'on') {
          this.service.updateCharacteristic(this.hapChar.ContactSensorState, 1)
          this.accessory.eveService.addEntry({ status: 0 })
          const initialTime = this.accessory.eveService.getInitialTime()
          this.service.updateCharacteristic(
            this.eveLastActivation,
            Math.round(new Date().valueOf() / 1000) - initialTime
          )
          this.timesOpened++
          this.service.updateCharacteristic(
            this.eveTimesOpened,
            this.timesOpened
          )
        } else {
          this.service.updateCharacteristic(this.hapChar.ContactSensorState, 0)
          this.accessory.eveService.addEntry({ status: 1 }) // swapped
        }
      }
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log(
          '[%s] current state [%s].',
          this.name,
          params.switch === 'on' ? 'open' : 'closed'
        )
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
