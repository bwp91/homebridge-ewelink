/* jshint esversion: 9, -W014, -W030, node: true */
"use strict";
let Characteristic, Service;
module.exports = class deviceUSB {
  constructor(platform) {
    this.platform = platform;
    Service = platform.api.hap.Service;
    Characteristic = platform.api.hap.Characteristic;
  }
  async internalUSBUpdate(accessory, value, callback) {
    callback();
    try {
      let params = {
          switches: this.platform.devicesInEW.get(accessory.context.eweDeviceId).params.switches,
        },
        outletService = accessory.getService(Service.Outlet);
      params.switches[0].switch = value ? "on" : "off";
      await this.platform.sendDeviceUpdate(accessory, params);
      outletService.updateCharacteristic(Characteristic.On, value);
    } catch (err) {
      this.platform.requestDeviceRefresh(accessory, err);
    }
  }
  externalUSBUpdate(accessory, params) {
    try {
      accessory.getService(Service.Outlet).updateCharacteristic(Characteristic.On, params.switches[0].switch === "on");
    } catch (err) {
      this.platform.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
};
