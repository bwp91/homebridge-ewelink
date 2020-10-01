'use strict'
let Characteristic, Service
module.exports = class deviceZBDev {
  constructor (platform) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
  }

  externalUpdate (accessory, params) {
    try {
      //* ** credit @tasict ***\\
      if (Object.prototype.hasOwnProperty.call(params, 'battery')) {
        if (accessory.context.eweUIID === 3026 && this.platform.config.ZBDWBatt) {
          params.battery *= 10
        }
        const batteryService =
          accessory.getService(Service.BatteryService) || accessory.addService(Service.BatteryService)
        batteryService.updateCharacteristic(Characteristic.BatteryLevel, params.battery)
        batteryService.updateCharacteristic(
          Characteristic.StatusLowBattery,
          params.battery < (this.platform.config.lowBattThreshold || 25)
        )
      }
      switch (accessory.context.eweUIID) {
        case 1000:
          if (Object.prototype.hasOwnProperty.call(params, 'key') && [0, 1, 2].includes(params.key)) {
            accessory
              .getService(Service.StatelessProgrammableSwitch)
              .updateCharacteristic(Characteristic.ProgrammableSwitchEvent, params.key)
          }
          break
        case 1770: {
          const eveLog = {
            time: Date.now()
          }
          if (Object.prototype.hasOwnProperty.call(params, 'temperature')) {
            const currentTemp = parseInt(params.temperature) / 100
            accessory
              .getService(Service.TemperatureSensor)
              .updateCharacteristic(Characteristic.CurrentTemperature, currentTemp)
            eveLog.temp = parseFloat(currentTemp)
          }
          if (Object.prototype.hasOwnProperty.call(params, 'humidity')) {
            const currentHumi = parseInt(params.humidity) / 100
            accessory
              .getService(Service.HumiditySensor)
              .updateCharacteristic(Characteristic.CurrentRelativeHumidity, currentHumi)
            eveLog.humidity = parseFloat(currentHumi)
          }
          if (Object.prototype.hasOwnProperty.call(eveLog, 'temp') || Object.prototype.hasOwnProperty.call(eveLog, 'humidity')) {
            accessory.eveLogger.addEntry(eveLog)
          }
          break
        }
        case 2026:
          if (Object.prototype.hasOwnProperty.call(params, 'motion') && Object.prototype.hasOwnProperty.call(params, 'trigTime')) {
            const timeNow = new Date()
            const diff = (timeNow.getTime() - params.trigTime) / 1000
            accessory
              .getService(Service.MotionSensor)
              .updateCharacteristic(
                Characteristic.MotionDetected,
                Object.prototype.hasOwnProperty.call(params, 'updateSource') &&
                  params.motion === 1 &&
                  diff < (this.platform.config.sensorTimeDifference || 120)
              )
            break
          }
          break
        case 3026:
          if (Object.prototype.hasOwnProperty.call(params, 'lock') && [0, 1].includes(params.lock)) {
            accessory
              .getService(Service.ContactSensor)
              .updateCharacteristic(Characteristic.ContactSensorState, params.lock)
          }
          break
        default:
          throw new Error('Zigbee device type not supported [uiid ' + accessory.context.eweUIID + ']')
      }
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
