/* jshint esversion: 9, -W014, -W030, node: true */
"use strict";
let Characteristic, Service;
module.exports = class deviceSCM {
  constructor(platform) {
    this.platform = platform;
    Service = platform.api.hap.Service;
    Characteristic = platform.api.hap.Characteristic;
  }

  async internalSCMUpdate(accessory, value, callback) {
    callback();
    try {
      let params = {
          switches: this.platform.devicesInEW.get(accessory.context.eweDeviceId).params.switches,
        },
        switchService = accessory.getService(Service.Switch);
      params.switches[0].switch = value ? "on" : "off";
      await this.platform.sendDeviceUpdate(accessory, params);
      switchService.updateCharacteristic(Characteristic.On, value);
    } catch (err) {
      this.platform.requestDeviceRefresh(accessory, err);
    }
  }
  externalSCMUpdate(accessory, params) {
    try {
      accessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, params.switches[0].switch === "on");
    } catch (err) {
      this.platform.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
};
