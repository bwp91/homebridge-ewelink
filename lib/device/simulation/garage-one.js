/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceGarageOne {
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
    this.setup = deviceConf.setup
    this.operationTimeUp = deviceConf.operationTime ||
      this.consts.defaultValues.operationTime
    this.operationTimeDown = deviceConf.operationTimeDown || this.operationTimeUp
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

    // Set up the accessory with default positions when added the first time
    if (!this.funcs.hasProperty(this.accessory.context, 'cacheCurrentDoorState')) {
      this.accessory.context.cacheCurrentDoorState = 1
      this.accessory.context.cacheTargetDoorState = 1
    }

    // Check for a valid setup
    if (!this.consts.allowed.setups.includes(this.setup)) {
      this.error = "device has not been set up as 'oneSwitch' or 'twoSwitch'"
    }

    // Check the sensor is valid if defined by the user
    if (deviceConf.sensorId) {
      // Check the sensor exists in Homebridge
      if (!platform.devicesInHB.has(deviceConf.sensorId + 'SWX')) {
        this.error = 'defined sensor does not exist in Homebridge'
      }

      // Check the sensor is a sensor
      if (platform.devicesInHB.get(deviceConf.sensorId + 'SWX').context.eweUIID !== 102) {
        this.error = 'defined sensor is not a DW2 sensor'
      }
      this.definedSensor = this.platform.devicesInHB.get(deviceConf.sensorId + 'SWX')

      // Check the sensor has the ContactSensor service
      if (!this.definedSensor.getService(this.hapServ.ContactSensor)) {
        this.error = 'defined sensor is not configured as a sensor'
      }
    }

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
      this.accessory.addService(this.hapServ.GarageDoorOpener)
        .setCharacteristic(this.hapChar.CurrentDoorState, 1)
        .setCharacteristic(this.hapChar.TargetDoorState, 1)
        .setCharacteristic(this.hapChar.ObstructionDetected, false)
      this.service = this.accessory.getService(this.hapServ.GarageDoorOpener)
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

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('door', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        operationTimeDown: this.operationTimeDown,
        operationTimeUp: this.operationTimeUp,
        setup: this.setup,
        type: deviceConf.type
      })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      if (this.error) {
        this.log.warn('[%s] invalid config - %s.', this.name, this.error)
        return
      }
      const newPos = value
      const params = {}
      let delay = 0
      const prevState = this.definedSensor
        ? this.definedSensor.getService(this.hapServ.ContactSensor)
          .getCharacteristic(this.hapChar.ContactSensorState).value === 0
          ? 1
          : 0
        : this.accessory.context.cacheCurrentDoorState
      if (newPos === prevState % 2) {
        return
      }
      this.inUse = true
      this.cacheState = value
      if (this.setup === 'oneSwitch' && [2, 3].includes(prevState)) {
        this.service.updateCharacteristic(
          this.hapChar.CurrentDoorState,
          ((prevState * 2) % 3) + 2
        )
        this.accessory.context.cacheCurrentDoorState = ((prevState * 2) % 3) + 2
        delay = 1500
      }
      if (this.cacheState !== newPos) {
        return
      }
      await this.funcs.sleep(delay)
      this.service.updateCharacteristic(this.hapChar.TargetDoorState, newPos)
        .updateCharacteristic(this.hapChar.CurrentDoorState, newPos + 2)
      this.accessory.context.cacheTargetDoorState = newPos
      this.accessory.context.cacheCurrentDoorState = newPos + 2
      switch (this.setup) {
        case 'oneSwitch':
          params.switch = 'on'
          break
        case 'twoSwitch':
          params.switches = this.accessory.context.eweUIID === 126
            ? this.consts.defaultDoubleSwitchOff
            : this.consts.defaultMultiSwitchOff
          params.switches[0].switch = newPos === 0 ? 'on' : 'off'
          params.switches[1].switch = newPos === 1 ? 'on' : 'off'
          break
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      await this.funcs.sleep(2000)
      this.inUse = false
      const operationTime = newPos === 0 ? this.operationTimeUp : this.operationTimeDown
      await this.funcs.sleep(Math.max((operationTime - 20) * 100, 0))
      if (!this.definedSensor) {
        this.service.updateCharacteristic(this.hapChar.CurrentDoorState, newPos)
        this.accessory.context.cacheCurrentDoorState = newPos
        if (!this.disableDeviceLogging) {
          this.log(
            '[%s] current state [%s].',
            this.name,
            newPos === 0 ? 'open' : 'closed'
          )
        }
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.error) {
        this.log.warn('[%s] invalid config - %s.', this.name, this.error)
        return
      }
      if ((!params.switch && !params.switches) || this.inUse || this.definedSensor) {
        return
      }
      const prevState = this.accessory.context.cacheCurrentDoorState
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
        .updateCharacteristic(this.hapChar.CurrentDoorState, newPos)
      this.accessory.context.cacheCurrentDoorState = newPos
      this.accessory.context.cacheTargetDoorState = newPos - 2
      await this.funcs.sleep(2000)
      this.inUse = false
      const operationTime = newPos === 2 ? this.operationTimeUp : this.operationTimeDown
      await this.funcs.sleep(Math.max((operationTime - 20) * 100, 0))
      this.service.updateCharacteristic(this.hapChar.CurrentDoorState, newPos - 2)
      this.accessory.context.cacheCurrentDoorState = newPos - 2
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, newPos === 2 ? 'open' : 'closed')
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
