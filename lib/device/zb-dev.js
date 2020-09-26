/* jshint esversion: 9, -W014, -W030, node: true */
"use strict";
let Characteristic, Service;
module.exports = class deviceZBDev {
  constructor(platform) {
    this.platform = platform;
    Service = platform.api.hap.Service;
    Characteristic = platform.api.hap.Characteristic;
  }
  externalZBUpdate(accessory, params) {
    try {
      //*** credit @tasict ***\\
      if (params.hasOwnProperty("battery")) {
        if (accessory.context.eweUIID === 3026 && (this.platform.config.ZBDWBatt || false)) {
          params.battery *= 10;
        }
        let batteryService =
          accessory.getService(Service.BatteryService) || accessory.addService(Service.BatteryService);
        batteryService.updateCharacteristic(Characteristic.BatteryLevel, params.battery);
        batteryService.updateCharacteristic(
          Characteristic.StatusLowBattery,
          params.battery < (this.platform.config.lowBattThreshold || 25)
        );
      }
      switch (accessory.context.eweUIID) {
        case 1000:
          if (params.hasOwnProperty("key") && [0, 1, 2].includes(params.key)) {
            accessory
              .getService(Service.StatelessProgrammableSwitch)
              .updateCharacteristic(Characteristic.ProgrammableSwitchEvent, params.key);
          }
          break;
        case 1770:
          let eveLog = {
            time: Date.now(),
          };
          if (params.hasOwnProperty("temperature")) {
            let currentTemp = parseInt(params.temperature) / 100;
            accessory
              .getService(Service.TemperatureSensor)
              .updateCharacteristic(Characteristic.CurrentTemperature, currentTemp);
            eveLog.temp = parseFloat(currentTemp);
          }
          if (params.hasOwnProperty("humidity")) {
            let currentHumi = parseInt(params.humidity) / 100;
            accessory
              .getService(Service.HumiditySensor)
              .updateCharacteristic(Characteristic.CurrentRelativeHumidity, currentHumi);
            eveLog.humidity = parseFloat(currentHumi);
          }
          if (eveLog.hasOwnProperty("temp") || eveLog.hasOwnProperty("humidity")) {
            accessory.eveLogger.addEntry(eveLog);
          }
          break;
        case 2026:
          if (params.hasOwnProperty("motion") && params.hasOwnProperty("trigTime")) {
            let timeNow = new Date(),
              diff = (timeNow.getTime() - params.trigTime) / 1000;
            accessory
              .getService(Service.MotionSensor)
              .updateCharacteristic(
                Characteristic.MotionDetected,
                params.hasOwnProperty("updateSource") &&
                  params.motion === 1 &&
                  diff < (this.platform.config.sensorTimeDifference || 120)
              );
            break;
          }
          break;
        case 3026:
          if (params.hasOwnProperty("lock") && [0, 1].includes(params.lock)) {
            accessory
              .getService(Service.ContactSensor)
              .updateCharacteristic(Characteristic.ContactSensorState, params.lock);
          }
          break;
      }
    } catch (err) {
      this.platform.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
};
