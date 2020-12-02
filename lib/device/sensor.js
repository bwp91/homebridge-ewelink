/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceSensor {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.lowBattThreshold = parseInt(this.platform.config.lowBattThreshold)
    this.lowBattThreshold = isNaN(this.lowBattThreshold)
      ? this.helpers.defaults.lowBattThreshold
      : this.lowBattThreshold < 5
        ? this.helpers.defaults.lowBattThreshold
        : this.lowBattThreshold
    this.contactService = accessory.getService(this.Service.ContactSensor) || accessory.addService(this.Service.ContactSensor)
    this.batteryService = accessory.getService(this.Service.BatteryService) || accessory.addService(this.Service.BatteryService)
    accessory.log = this.log
    accessory.eveLogger = new this.platform.eveService('door', accessory, {
      storage: 'fs',
      path: this.platform.eveLogPath
    })
    this.accessory = accessory
  }

  async externalUpdate (params) {
    try {
      if (this.helpers.hasProperty(params, 'battery')) {
        const scaledBattery = Math.round(params.battery * 33.3)
        this.batteryService
          .updateCharacteristic(this.Characteristic.BatteryLevel, scaledBattery)
          .updateCharacteristic(this.Characteristic.StatusLowBattery, scaledBattery < this.lowBattThreshold)
      }
      if (!this.helpers.hasProperty(params, 'switch')) return
      const newState = params.switch === 'on' ? 1 : 0
      let oAccessory = false
      this.contactService.updateCharacteristic(this.Characteristic.ContactSensorState, newState)
      this.accessory.eveLogger.addEntry({
        time: Math.round(new Date().valueOf() / 1000),
        status: newState
      })
      this.platform.cusG.forEach(async group => {
        if (group.sensorId === this.accessory.context.eweDeviceId && group.type === 'garage') {
          if ((oAccessory = this.platform.devicesInHB.get(group.deviceId + 'SWX'))) {
            const gdService = oAccessory.getService(this.Service.GarageDoorOpener)
            switch (newState) {
              case 0:
                gdService
                  .updateCharacteristic(this.Characteristic.TargetDoorState, 1)
                  .updateCharacteristic(this.Characteristic.CurrentDoorState, 1)
                break
              case 1:
                await this.helpers.sleep(Math.max(group.operationTime * 100, 1000))
                gdService
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
