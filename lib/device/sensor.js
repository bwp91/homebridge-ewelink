/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const helpers = require('./../helpers')
module.exports = class deviceSensor {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    if (!accessory.getService(this.Service.ContactSensor)) accessory.addService(this.Service.ContactSensor)
    if (!accessory.getService(this.Service.BatteryService)) accessory.addService(this.Service.BatteryService)
    this.accessory = accessory
  }

  async externalUpdate (params) {
    try {
      if (helpers.hasProperty(params, 'battery')) {
        const batteryService =
            this.accessory.getService(this.Service.BatteryService) || this.accessory.addService(this.Service.BatteryService)
        const scaledBattery = Math.round(params.battery * 33.3)
        batteryService.updateCharacteristic(this.Characteristic.BatteryLevel, scaledBattery)
        batteryService.updateCharacteristic(
          this.Characteristic.StatusLowBattery,
          scaledBattery < (this.platform.config.lowBattThreshold || 25)
        )
      }
      if (!helpers.hasProperty(params, 'switch')) return
      const newState = params.switch === 'on' ? 1 : 0
      let oAccessory = false
      const contactService = this.accessory.getService(this.Service.ContactSensor)
      contactService.updateCharacteristic(this.Characteristic.ContactSensorState, newState)
      this.platform.cusG.forEach(async group => {
        if (group.sensorId === this.accessory.context.eweDeviceId && group.type === 'garage') {
          if ((oAccessory = this.platform.devicesInHB.get(group.deviceId + 'SWX'))) {
            switch (newState) {
              case 0:
                oAccessory
                  .getService(this.Service.GarageDoorOpener)
                  .updateCharacteristic(this.Characteristic.TargetDoorState, 1)
                  .updateCharacteristic(this.Characteristic.CurrentDoorState, 1)
                break
              case 1:
                await helpers.sleep(Math.max(group.operationTime * 100, 1000))
                oAccessory
                  .getService(this.Service.GarageDoorOpener)
                  .updateCharacteristic(this.Characteristic.TargetDoorState, 0)
                  .updateCharacteristic(this.Characteristic.CurrentDoorState, 0)
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
