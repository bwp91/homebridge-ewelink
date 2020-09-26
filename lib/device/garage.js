/* jshint esversion: 9, -W014, -W030, node: true */
"use strict";
let Characteristic, Service;
const utils = require("./../utils");
module.exports = class deviceGarage {
  constructor(platform) {
    this.platform = platform;
    Service = platform.api.hap.Service;
    Characteristic = platform.api.hap.Characteristic;
  }
  async internalGarageUpdate(accessory, value, callback) {
    callback();
    try {
      let garageConfig;
      if (!(garageConfig = this.platform.cusG.get(accessory.context.hbDeviceId))) {
        throw "group config missing";
      }
      if (garageConfig.type !== "garage" || !["oneSwitch", "twoSwitch"].includes(garageConfig.setup)) {
        throw "improper configuration";
      }
      let sensorDefinition = garageConfig.sensorId || false,
        sAccessory = false,
        prevState,
        newPos = value,
        params = {},
        delay = 0,
        gdService = accessory.getService(Service.GarageDoorOpener);
      if (sensorDefinition && !(sAccessory = this.platform.devicesInHB.get(garageConfig.sensorId + "SWX"))) {
        throw "defined DW2 sensor doesn't exist";
      }
      if (sensorDefinition && sAccessory.context.type !== "sensor") {
        throw "defined DW2 sensor isn't a sensor";
      }
      prevState = sAccessory
        ? sAccessory.getService(Service.ContactSensor).getCharacteristic(Characteristic.ContactSensorState).value === 0
          ? 1
          : 0
        : accessory.context.cacheCurrentDoorState;
      if (newPos === prevState % 2) return;
      accessory.context.inUse = true;
      accessory.context.state = value;
      if (garageConfig.setup === "oneSwitch" && [2, 3].includes(prevState)) {
        gdService.updateCharacteristic(Characteristic.CurrentDoorState, ((prevState * 2) % 3) + 2);
        accessory.context.cacheCurrentDoorState = ((prevState * 2) % 3) + 2;
        delay = 1500;
      }
      if (accessory.context.state !== newPos) return;
      await utils.sleep(delay);
      gdService
        .updateCharacteristic(Characteristic.TargetDoorState, newPos)
        .updateCharacteristic(Characteristic.CurrentDoorState, newPos + 2);
      accessory.context.cacheTargetDoorState = newPos;
      accessory.context.cacheCurrentDoorState = newPos + 2;
      switch (garageConfig.setup) {
        case "oneSwitch":
          params.switch = "on";
          break;
        case "twoSwitch":
          params.switches = this.platform.devicesInEW.get(accessory.context.eweDeviceId).params.switches;
          params.switches[0].switch = newPos === 0 ? "on" : "off";
          params.switches[1].switch = newPos === 1 ? "on" : "off";
          break;
      }
      await this.platform.sendDeviceUpdate(accessory, params);
      await utils.sleep(garageConfig.operationTime * 100);
      if (!sAccessory) {
        gdService.updateCharacteristic(Characteristic.CurrentDoorState, newPos);
        accessory.context.cacheCurrentDoorState = newPos;
      }
      accessory.context.inUse = false;
    } catch (err) {
      this.platform.requestDeviceRefresh(accessory, err);
    }
  }
  externalGarageUpdate(accessory, params) {
    try {
      let garageConfig,
        gcService = accessory.getService(Service.GarageDoorOpener),
        prevState = accessory.context.cacheCurrentDoorState,
        newPos = [0, 2].includes(prevState) ? 3 : 2;
      if (!(garageConfig = this.platform.cusG.get(accessory.context.hbDeviceId))) {
        throw "group config missing";
      }
      if (garageConfig.type !== "garage" || !["oneSwitch", "twoSwitch"].includes(garageConfig.setup)) {
        throw "improper configuration";
      }
      if (accessory.context.inUse || garageConfig.sensorId) {
        return;
      }
      switch (garageConfig.setup) {
        case "oneSwitch":
          if (params.switch === "off") {
            return;
          }
          break;
        case "twoSwitch":
          if (
            params.switches[0].switch === params.switches[1].switch ||
            params.switches[prevState % 2].switch === "on"
          ) {
            return;
          }
          break;
      }
      accessory.context.inUse = true;
      if (!garageConfig.sensorId) {
        gcService
          .updateCharacteristic(Characteristic.CurrentDoorState, newPos)
          .updateCharacteristic(Characteristic.TargetDoorState, newPos - 2);
        accessory.context.cacheCurrentDoorState = newPos;
        accessory.context.cacheTargetDoorState = newPos - 2;
        setTimeout(() => {
          gcService.updateCharacteristic(Characteristic.CurrentDoorState, newPos - 2);
          accessory.context.cacheCurrentDoorState = newPos - 2;
        }, parseInt(garageConfig.operationTime) * 100);
      }
      setTimeout(() => {
        accessory.context.inUse = false;
      }, parseInt(garageConfig.operationTime) * 100);
    } catch (err) {
      accessory.context.inUse = false;
      this.platform.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
};
