/* jshint esversion: 9, -W014, -W030, node: true */
"use strict";
let Characteristic, EveService, Service;
const hbLib = require("homebridge-lib");
module.exports = class deviceOutlet {
  constructor(platform, homebridge) {
    this.platform = platform;
    Service = platform.api.hap.Service;
    Characteristic = platform.api.hap.Characteristic;
    EveService = new hbLib.EveHomeKitTypes(platform.api);
  }
  async internalOutletUpdate(accessory, value, callback) {
    callback();
    try {
      let params = {
          switch: value ? "on" : "off",
        },
        outletService = accessory.getService(Service.Outlet);
      await this.platform.sendDeviceUpdate(accessory, params);
      outletService.updateCharacteristic(Characteristic.On, value);
    } catch (err) {
      this.platform.requestDeviceRefresh(accessory, err);
    }
  }
  externalOutletUpdate(accessory, params) {
    try {
      let outletService = accessory.getService(Service.Outlet);
      if (params.hasOwnProperty("switch")) {
        outletService.updateCharacteristic(Characteristic.On, params.switch === "on");
        if (accessory.context.eweModel === "S26" || this.platform.config.disableEveLogging || false) {
          outletService.updateCharacteristic(Characteristic.OutletInUse, params.switch === "on");
        }
      }
      if (params.hasOwnProperty("power")) {
        outletService.updateCharacteristic(EveService.Characteristics.CurrentConsumption, parseFloat(params.power));
        outletService.updateCharacteristic(
          Characteristic.OutletInUse,
          parseFloat(params.power) > (this.platform.config.inUsePowerThreshold || 0)
        );
        let isOn = accessory.getService(Service.Outlet).getCharacteristic(Characteristic.On).value;
        accessory.eveLogger.addEntry({
          time: Date.now(),
          power: isOn ? parseFloat(params.power) : 0,
        });
      }
      if (params.hasOwnProperty("voltage")) {
        outletService.updateCharacteristic(EveService.Characteristics.Voltage, parseFloat(params.voltage));
      }
      if (params.hasOwnProperty("current")) {
        outletService.updateCharacteristic(EveService.Characteristics.ElectricCurrent, parseFloat(params.current));
      }
    } catch (err) {
      this.platform.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
};
