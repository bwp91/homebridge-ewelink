/* jshint esversion: 9, -W014, -W030, node: true */
"use strict";
let Characteristic, Service;
module.exports = class deviceValve {
  constructor(platform) {
    this.platform = platform;
    Service = platform.api.hap.Service;
    Characteristic = platform.api.hap.Characteristic;
  }
  async internalValveUpdate(accessory, valve, value, callback) {
    callback();
    try {
      let params = {},
        serviceValve = accessory.getService(valve);
      params.switches = this.platform.devicesInEW.get(accessory.context.eweDeviceId).params.switches;
      switch (valve) {
        case "Valve A":
          params.switches[0].switch = value ? "on" : "off";
          params.switches[1].switch = accessory.getService("Valve B").getCharacteristic(Characteristic.Active).value
            ? "on"
            : "off";
          break;
        case "Valve B":
          params.switches[0].switch = accessory.getService("Valve A").getCharacteristic(Characteristic.Active).value
            ? "on"
            : "off";
          params.switches[1].switch = value ? "on" : "off";
          break;
      }
      params.switches[2].switch = "off";
      params.switches[3].switch = "off";
      await this.platform.sendDeviceUpdate(accessory, params);
      serviceValve.updateCharacteristic(Characteristic.Active, value).updateCharacteristic(Characteristic.InUse, value);
      switch (value) {
        case 0:
          serviceValve.updateCharacteristic(Characteristic.RemainingDuration, 0);
          clearTimeout(accessory.getService(valve).timer);
          break;
        case 1:
          let timer = serviceValve.getCharacteristic(Characteristic.SetDuration).value;
          serviceValve.updateCharacteristic(Characteristic.RemainingDuration, timer);
          serviceValve.timer = setTimeout(() => serviceValve.setCharacteristic(Characteristic.Active, 0), timer * 1000);
          break;
      }
    } catch (err) {
      this.platform.requestDeviceRefresh(accessory, err);
    }
  }
  externalValveUpdate(accessory, params) {
    try {
      ["A", "B"].forEach((v, k) => {
        let valveService = accessory.getService("Valve " + v);
        valveService
          .updateCharacteristic(Characteristic.Active, params.switches[k].switch === "on")
          .updateCharacteristic(Characteristic.InUse, params.switches[k].switch === "on");
        if (params.switches[k].switch === "on") {
          let timer = valveService.getCharacteristic(Characteristic.SetDuration).value;
          valveService.updateCharacteristic(Characteristic.RemainingDuration, timer);
          valveService.timer = setTimeout(() => {
            valveService.setCharacteristic(Characteristic.Active, 0);
          }, timer * 1000);
        } else {
          valveService.updateCharacteristic(Characteristic.RemainingDuration, 0);
          clearTimeout(valveService.timer);
        }
      });
    } catch (err) {
      this.platform.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
};
