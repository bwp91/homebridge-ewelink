/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const util = require('util')
module.exports = class deviceSensor {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    const self = this
    this.eveLastActivation = function () {
      self.Characteristic.call(this, 'Last Activation', self.helpers.eveUUID.lastActivation)
      this.setProps({
        format: self.Characteristic.Formats.UINT32,
        unit: self.Characteristic.Units.SECONDS,
        perms: [self.Characteristic.Perms.READ, self.Characteristic.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    util.inherits(this.eveLastActivation, this.Characteristic)
    this.eveLastActivation.UUID = this.helpers.eveUUID.lastActivation
    this.lowBattThreshold = parseInt(this.platform.config.lowBattThreshold)
    this.lowBattThreshold = isNaN(this.lowBattThreshold)
      ? this.helpers.defaults.lowBattThreshold
      : this.lowBattThreshold < 5
        ? this.helpers.defaults.lowBattThreshold
        : this.lowBattThreshold
    this.contactService = accessory.getService(this.Service.ContactSensor) || accessory.addService(this.Service.ContactSensor)
    this.batteryService = accessory.getService(this.Service.BatteryService) || accessory.addService(this.Service.BatteryService)
    accessory.log = platform.debug ? this.log : () => {}
    accessory.eveService = new this.platform.eveService('door', accessory)
    this.accessory = accessory
  }

  async externalUpdate (params) {
    try {
      if (this.helpers.hasProperty(params, 'battery')) {
        const scaledBattery = Math.round(params.battery * 33.3)
        if (this.cacheBattery !== scaledBattery) {
          this.batteryService.updateCharacteristic(this.Characteristic.BatteryLevel, this.cacheBattery)
            .updateCharacteristic(this.Characteristic.StatusLowBattery, this.cacheBattery < this.lowBattThreshold)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current battery [%s%].', this.accessory.displayName, this.cacheBattery)
          }
        }
      }
      if (!params.switch || params.switch === this.cacheOnOff) return
      this.cacheOnOff = params.switch
      const newState = params.switch === 'on' ? 1 : 0
      this.contactService.updateCharacteristic(this.Characteristic.ContactSensorState, newState)
      this.accessory.eveService.addEntry({ status: newState })
      if (newState) {
        this.contactService.updateCharacteristic(
          this.eveLastActivation,
          Math.round(new Date().valueOf() / 1000) - this.accessory.eveService.getInitialTime()
        )
      }
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current state [contact%s detected].', this.accessory.displayName, newState === 0 ? '' : ' not')
      }
      let oAccessory
      this.platform.cusG.forEach(async group => {
        if (group.sensorId === this.accessory.context.eweDeviceId && group.type === 'garage') {
          if ((oAccessory = this.platform.devicesInHB.get(group.deviceId + 'SWX'))) {
            const gdService = oAccessory.getService(this.Service.GarageDoorOpener)
            switch (newState) {
              case 0:
                gdService.updateCharacteristic(this.Characteristic.TargetDoorState, 1)
                  .updateCharacteristic(this.Characteristic.CurrentDoorState, 1)
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log('[%s] current state [closed].', oAccessory.displayName)
                }
                break
              case 1:
                await this.helpers.sleep(Math.max(group.operationTime * 100, 2000))
                gdService.updateCharacteristic(this.Characteristic.TargetDoorState, 0)
                  .updateCharacteristic(this.Characteristic.CurrentDoorState, 0)
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
