/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceZBSensorContact {
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
    const deviceConf = platform.sensorDevices[deviceId]
    this.scaleBattery = deviceConf && deviceConf.scaleBattery
    this.lowBattThreshold = deviceConf && deviceConf.lowBattThreshold
      ? Math.min(deviceConf.lowBattThreshold, 100)
      : platform.consts.defaultValues.lowBattThreshold
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
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
    this.eveClosedDurationn.UUID = this.consts.eve.closedDuration
    this.eveTimesOpened.UUID = this.consts.eve.timesOpened

    // Add the contact sensor service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.ContactSensor) ||
      this.accessory.addService(this.hapServ.ContactSensor)
    
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
      .on('set', (value, callback) => {
        callback()
        this.timesOpened = 0
        this.service.updateCharacteristic(this.eveTimesOpened, 0)
      })

    // Add the battery service if it doesn't already exist
    this.battService = this.accessory.getService(this.hapServ.BatteryService) ||
      this.accessory.addService(this.hapServ.BatteryService)

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('door', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        lowBattThreshold: this.lowBattThreshold,
        scaleBattery: this.scaleBattery
      })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.funcs.hasProperty(params, 'battery') && params.battery !== this.cacheBattery) {
        this.cacheBattery = params.battery
        const scaledBatt = this.scaleBattery ? this.cacheBattery * 10 : this.cacheBattery
        this.battService.updateCharacteristic(this.hapChar.BatteryLevel, scaledBatt)
        this.battService.updateCharacteristic(this.hapChar.StatusLowBattery, scaledBatt < this.lowBattThreshold)
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current battery [%s%].', this.name, scaledBatt)
        }
      }
      if (this.funcs.hasProperty(params, 'lock') && [0, 1].includes(params.lock)) {
        this.service.updateCharacteristic(this.hapChar.ContactSensorState, params.lock)
        if (params.lock === 1)
          this.service.updateCharacteristic(this.hapChar.ContactSensorState, 1)
          this.accessory.eveService.addEntry({ status: 1 })
          const initialTime = this.accessory.eveService.getInitialTime()
          this.service.updateCharacteristic(
            this.eveLastActivation,
            Math.round(new Date().valueOf() / 1000) - initialTime
          )
          this.timesOpened++
          this.service.updateCharacteristic(this.eveTimesOpened, this.timesOpened)
        } else {
          this.service.updateCharacteristic(this.hapChar.ContactSensorState, 0)
          this.accessory.eveService.addEntry({ status: 0 })
        }
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [contact%s detected].', this.name, params.lock === 0 ? '' : ' not')
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
