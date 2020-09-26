/* jshint esversion: 9, -W014, -W030, node: true */
"use strict";
let Characteristic, Service;
module.exports = class deviceSwitch {
  constructor(platform) {
    this.platform = platform;
    Service = platform.api.hap.Service;
    Characteristic = platform.api.hap.Characteristic;
  }
  async internalSwitchUpdate(accessory, value, callback) {
    callback();
    try {
      let oAccessory,
        params = {},
        switchService = accessory.getService(Service.Switch);
      switch (accessory.context.switchNumber) {
        case "X":
          params.switch = value ? "on" : "off";
          break;
        case "0":
          params.switches = this.platform.devicesInEW.get(accessory.context.eweDeviceId).params.switches;
          params.switches[0].switch = value ? "on" : "off";
          params.switches[1].switch = value ? "on" : "off";
          params.switches[2].switch = value ? "on" : "off";
          params.switches[3].switch = value ? "on" : "off";
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          params.switches = this.platform.devicesInEW.get(accessory.context.eweDeviceId).params.switches;
          for (let i = 1; i <= 4; i++) {
            if ((oAccessory = this.platform.devicesInHB.get(accessory.context.eweDeviceId + "SW" + i))) {
              i === parseInt(accessory.context.switchNumber)
                ? (params.switches[i - 1].switch = value ? "on" : "off")
                : (params.switches[i - 1].switch = oAccessory
                    .getService(Service.Switch)
                    .getCharacteristic(Characteristic.On).value
                    ? "on"
                    : "off");
            } else {
              params.switches[i - 1].switch = "off";
            }
          }
          break;
      }
      await this.platform.sendDeviceUpdate(accessory, params);
      switch (accessory.context.switchNumber) {
        case "X":
          switchService.updateCharacteristic(Characteristic.On, value);
          break;
        case "0":
          for (let i = 0; i <= 4; i++) {
            if ((oAccessory = this.platform.devicesInHB.get(accessory.context.eweDeviceId + "SW" + i))) {
              oAccessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, value);
            }
          }
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          switchService.updateCharacteristic(Characteristic.On, value);
          let masterState = "off";
          for (let i = 1; i <= 4; i++) {
            if ((oAccessory = this.platform.devicesInHB.get(accessory.context.eweDeviceId + "SW" + i))) {
              if (oAccessory.getService(Service.Switch).getCharacteristic(Characteristic.On).value) {
                masterState = "on";
              }
            }
          }
          if (!this.platform.hiddenMasters.includes(accessory.context.eweDeviceId)) {
            oAccessory = this.platform.devicesInHB.get(accessory.context.eweDeviceId + "SW0");
            oAccessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, masterState === "on");
          }
          break;
      }
    } catch (err) {
      this.platform.requestDeviceRefresh(accessory, err);
    }
  }
  externalSingleSwitchUpdate(accessory, params) {
    try {
      accessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, params.switch === "on");
    } catch (err) {
      this.platform.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
  externalMultiSwitchUpdate(accessory, params) {
    try {
      let idToCheck = accessory.context.hbDeviceId.slice(0, -1),
        primaryState = false;
      for (let i = 1; i <= accessory.context.channelCount; i++) {
        if (this.platform.devicesInHB.has(idToCheck + i)) {
          let oAccessory = this.platform.devicesInHB.get(idToCheck + i);
          oAccessory
            .getService(Service.Switch)
            .updateCharacteristic(Characteristic.On, params.switches[i - 1].switch === "on");
          if (params.switches[i - 1].switch === "on") {
            primaryState = true;
          }
        }
      }
      if (!this.platform.hiddenMasters.includes(accessory.context.eweDeviceId)) {
        accessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, primaryState);
      }
    } catch (err) {
      this.platform.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
};
