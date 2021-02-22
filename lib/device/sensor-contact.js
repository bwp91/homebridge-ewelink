/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSensorContact {
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

    // If the accessory has a leak sensor service then remove it
    if (this.accessory.getService(this.hapServ.LeakSensor)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.LeakSensor))
    }

    // Add the contact sensor service if it doesn't already exist
    this.contactService = this.accessory.getService(this.hapServ.ContactSensor) ||
      this.accessory.addService(this.hapServ.ContactSensor)

    // Add the Eve characteristics if they don't already exist
    if (!this.contactService.testCharacteristic(this.eveLastActivation)) {
      this.contactService.addCharacteristic(this.eveLastActivation)
    }
    if (!this.contactService.testCharacteristic(this.eveResetTotal)) {
      this.contactService.addCharacteristic(this.eveResetTotal)
    }
    if (!this.contactService.testCharacteristic(this.eveOpenDuration)) {
      this.contactService.addCharacteristic(this.eveOpenDuration)
    }
    if (!this.contactService.testCharacteristic(this.eveClosedDuration)) {
      this.contactService.addCharacteristic(this.eveClosedDuration)
    }
    if (!this.contactService.testCharacteristic(this.eveTimesOpened)) {
      this.contactService.addCharacteristic(this.eveTimesOpened)
    }
    this.timesOpened = this.contactService.getCharacteristic(this.eveTimesOpened).value
    this.contactService.getCharacteristic(this.eveResetTotal)
      .on('set', (value, callback) => {
        callback()
        this.timesOpened = 0
        this.contactService.updateCharacteristic(this.eveTimesOpened, 0)
      })

    // Add the battery service if it doesn't already exist
    this.batteryService = this.accessory.getService(this.hapServ.BatteryService) ||
      this.accessory.addService(this.hapServ.BatteryService)

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('door', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        lowBattThreshold: this.lowBattThreshold
      })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.funcs.hasProperty(params, 'battery')) {
        const scaledBattery = Math.round(params.battery * 33.3)
        if (this.cacheBattery !== scaledBattery) {
          this.cacheBattery = scaledBattery
          this.batteryService.updateCharacteristic(this.hapChar.BatteryLevel, this.cacheBattery)
            .updateCharacteristic(this.hapChar.StatusLowBattery, this.cacheBattery < this.lowBattThreshold)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current battery [%s%].', this.name, this.cacheBattery)
          }
        }
      }
      if (!params.switch || params.switch === this.cacheOnOff) {
        return
      }
      this.cacheOnOff = params.switch
      const newState = params.switch === 'on' ? 1 : 0
      if (newState) {
        this.contactService.updateCharacteristic(this.hapChar.ContactSensorState, 1)
        this.accessory.eveService.addEntry({ status: 1 })
        const initialTime = this.accessory.eveService.getInitialTime()
        this.contactService.updateCharacteristic(
          this.eveLastActivation,
          Math.round(new Date().valueOf() / 1000) - initialTime
        )
        this.timesOpened++
        this.contactService.updateCharacteristic(this.eveTimesOpened, this.timesOpened)
      } else {
        this.contactService.updateCharacteristic(this.hapChar.ContactSensorState, 0)
        this.accessory.eveService.addEntry({ status: 0 })
      }
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current state [contact%s detected].', this.name, newState === 0 ? '' : ' not')
      }
      let oAccessory
      for (const [deviceId, group] of Object.entries(this.platform.simulations)) {
        if (group.sensorId === this.accessory.context.eweDeviceId && group.type === 'garage') {
          if ((oAccessory = this.platform.devicesInHB.get(deviceId + 'SWX'))) {
            const gdService = oAccessory.getService(this.hapServ.GarageDoorOpener)
            switch (newState) {
              case 0:
                gdService.updateCharacteristic(this.hapChar.TargetDoorState, 1)
                  .updateCharacteristic(this.hapChar.CurrentDoorState, 1)
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log('[%s] current state [closed].', oAccessory.displayName)
                }
                break
              case 1:
                await this.funcs.sleep(Math.max(group.operationTime * 100, 2000))
                gdService.updateCharacteristic(this.hapChar.TargetDoorState, 0)
                  .updateCharacteristic(this.hapChar.CurrentDoorState, 0)
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log('[%s] current state [open].', oAccessory.displayName)
                }
                break
            }
          }
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
