/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSensorContact {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.disableDeviceLogging = platform.config.disableDeviceLogging
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
    this.lowBattThreshold = this.platform.config.lowBattThreshold

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
    this.inherits(this.eveLastActivation, this.hapChar)
    this.eveLastActivation.UUID = this.consts.eve.lastActivation

    // Add the contact sensor service if it doesn't already exist
    this.contactService = this.accessory.getService(this.hapServ.ContactSensor) ||
      this.accessory.addService(this.hapServ.ContactSensor)

    // Add the battery service if it doesn't already exist
    this.batteryService = this.accessory.getService(this.hapServ.BatteryService) ||
      this.accessory.addService(this.hapServ.BatteryService)

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('door', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })
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
      this.contactService.updateCharacteristic(this.hapChar.ContactSensorState, newState)
      this.accessory.eveService.addEntry({ status: newState })
      if (newState) {
        this.contactService.updateCharacteristic(
          this.eveLastActivation,
          Math.round(new Date().valueOf() / 1000) - this.accessory.eveService.getInitialTime()
        )
      }
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current state [contact%s detected].', this.name, newState === 0 ? '' : ' not')
      }
      let oAccessory
      for (const group of Object.entries(this.platform.rfSensors)) {
        if (group.sensorId === this.accessory.context.eweDeviceId && group.type === 'garage') {
          if ((oAccessory = this.platform.devicesInHB.get(group.deviceId + 'SWX'))) {
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
