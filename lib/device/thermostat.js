/* jshint esversion: 9, -W014, -W030, node: true */
"use strict";
let Characteristic, Service;
module.exports = class deviceThermostat {
  constructor(platform, homebridge) {
    this.platform = platform;
  }
  async internalThermostatUpdate(accessory, value, callback) {
    callback();
    try {
      let params = {
          switch: value ? "on" : "off",
          mainSwitch: value ? "on" : "off",
        },
        switchService = accessory.getService(Service.Switch);
      await this.platform.sendDeviceUpdate(accessory, params);
      switchService.updateCharacteristic(Characteristic.On, value);
    } catch (err) {
      this.platform.requestDeviceRefresh(accessory, err);
    }
  }
  externalThermostatUpdate(accessory, params) {
    try {
      if (
        !this.platform.config.hideTHSwitch &&
        (params.hasOwnProperty("switch") || params.hasOwnProperty("mainSwitch"))
      ) {
        let newState = params.hasOwnProperty("switch") ? params.switch === "on" : params.mainSwitch === "on",
          switchService = accessory.getService(Service.Switch);
        switchService.updateCharacteristic(Characteristic.On, newState);
      }
      if (!(this.platform.config.disableEveLogging || false)) {
        let eveLog = {
          time: Date.now(),
        };
        if (params.hasOwnProperty("currentTemperature") && accessory.getService(Service.TemperatureSensor)) {
          let currentTemp = params.currentTemperature !== "unavailable" ? params.currentTemperature : 0;
          accessory
            .getService(Service.TemperatureSensor)
            .updateCharacteristic(Characteristic.CurrentTemperature, currentTemp);
          eveLog.temp = parseFloat(currentTemp);
        }
        if (params.hasOwnProperty("currentHumidity") && accessory.getService(Service.HumiditySensor)) {
          let currentHumi = params.currentHumidity !== "unavailable" ? params.currentHumidity : 0;
          accessory
            .getService(Service.HumiditySensor)
            .updateCharacteristic(Characteristic.CurrentRelativeHumidity, currentHumi);
          eveLog.humidity = parseFloat(currentHumi);
        }
        if (eveLog.hasOwnProperty("temp") || eveLog.hasOwnProperty("humidity")) {
          accessory.eveLogger.addEntry(eveLog);
        }
      }
    } catch (err) {
      this.platform.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
};
