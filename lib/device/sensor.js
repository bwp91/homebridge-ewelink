'use strict'
let Characteristic, Service
module.exports = class deviceSensor {
  constructor (platform) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
  }

  externalSensorUpdate (accessory, params) {
    try {
      if (Object.prototype.hasOwnProperty.call(params, 'battery')) {
        const batteryService =
            accessory.getService(Service.BatteryService) || accessory.addService(Service.BatteryService)
        const scaledBattery = Math.round(params.battery * 33.3)
        batteryService.updateCharacteristic(Characteristic.BatteryLevel, scaledBattery)
        batteryService.updateCharacteristic(
          Characteristic.StatusLowBattery,
          scaledBattery < (this.platform.config.lowBattThreshold || 25)
        )
      }
      if (!Object.prototype.hasOwnProperty.call(params, 'switch')) return
      const newState = params.switch === 'on' ? 1 : 0
      let oAccessory = false
      const contactService = accessory.getService(Service.ContactSensor)
      contactService.updateCharacteristic(Characteristic.ContactSensorState, newState)
      this.platform.cusG.forEach(group => {
        if (group.sensorId === accessory.context.eweDeviceId && group.type === 'garage') {
          if ((oAccessory = this.platform.devicesInHB.get(group.deviceId + 'SWX'))) {
            switch (newState) {
              case 0:
                oAccessory
                  .getService(Service.GarageDoorOpener)
                  .updateCharacteristic(Characteristic.TargetDoorState, 1)
                  .updateCharacteristic(Characteristic.CurrentDoorState, 1)
                break
              case 1:
                setTimeout(() => {
                  oAccessory
                    .getService(Service.GarageDoorOpener)
                    .updateCharacteristic(Characteristic.TargetDoorState, 0)
                    .updateCharacteristic(Characteristic.CurrentDoorState, 0)
                }, group.operationTime * 100)
                break
            }
          }
        }
      })
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
