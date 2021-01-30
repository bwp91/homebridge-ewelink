/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceSensorContact {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    this.dName = accessory.displayName
    this.accessory = accessory

    this.inherits = require('util').inherits
    const self = this
    this.eveLastActivation = function () {
      self.C.call(this, 'Last Activation', self.helpers.eveUUID.lastActivation)
      this.setProps({
        format: self.C.Formats.UINT32,
        unit: self.C.Units.SECONDS,
        perms: [self.C.Perms.READ, self.C.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.inherits(this.eveLastActivation, this.C)
    this.eveLastActivation.UUID = this.helpers.eveUUID.lastActivation
    this.lowBattThreshold = parseInt(this.platform.config.lowBattThreshold)
    this.lowBattThreshold = isNaN(this.lowBattThreshold) || this.lowBattThreshold < 5
      ? this.helpers.defaults.lowBattThreshold
      : this.lowBattThreshold
    this.contactService = this.accessory.getService(this.S.ContactSensor) || this.accessory.addService(this.S.ContactSensor)
    this.batteryService = this.accessory.getService(this.S.BatteryService) || this.accessory.addService(this.S.BatteryService)
    this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
    this.accessory.historyService = new this.platform.eveService('door', this.accessory, {
      storage: 'fs',
      path: platform.eveLogPath
    })
  }

  async externalUpdate (params) {
    try {
      if (this.helpers.hasProperty(params, 'battery')) {
        const scaledBattery = Math.round(params.battery * 33.3)
        if (this.cacheBattery !== scaledBattery) {
          this.cacheBattery = scaledBattery
          this.batteryService.updateCharacteristic(this.C.BatteryLevel, this.cacheBattery)
            .updateCharacteristic(this.C.StatusLowBattery, this.cacheBattery < this.lowBattThreshold)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current battery [%s%].', this.dName, this.cacheBattery)
          }
        }
      }
      if (!params.switch || params.switch === this.cacheOnOff) {
        return
      }
      this.cacheOnOff = params.switch
      const newState = params.switch === 'on' ? 1 : 0
      this.contactService.updateCharacteristic(this.C.ContactSensorState, newState)
      this.accessory.historyService.addEntry({
        time: Math.round(new Date().valueOf() / 1000),
        status: newState
      })
      if (newState) {
        this.contactService.updateCharacteristic(
          this.eveLastActivation,
          Math.round(new Date().valueOf() / 1000) - this.accessory.historyService.getInitialTime()
        )
      }
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current state [contact%s detected].', this.dName, newState === 0 ? '' : ' not')
      }
      let oAccessory
      this.platform.cusG.forEach(async group => {
        if (group.sensorId === this.accessory.context.eweDeviceId && group.type === 'garage') {
          if ((oAccessory = this.platform.devicesInHB.get(group.deviceId + 'SWX'))) {
            const gdService = oAccessory.getService(this.S.GarageDoorOpener)
            switch (newState) {
              case 0:
                gdService.updateCharacteristic(this.C.TargetDoorState, 1)
                  .updateCharacteristic(this.C.CurrentDoorState, 1)
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log('[%s] current state [closed].', oAccessory.displayName)
                }
                break
              case 1:
                await this.helpers.sleep(Math.max(group.operationTime * 100, 2000))
                gdService.updateCharacteristic(this.C.TargetDoorState, 0)
                  .updateCharacteristic(this.C.CurrentDoorState, 0)
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log('[%s] current state [open].', oAccessory.displayName)
                }
                break
            }
          }
        }
      })
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
