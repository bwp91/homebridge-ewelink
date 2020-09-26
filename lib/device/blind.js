/* jshint esversion: 9, -W014, -W030, node: true */
"use strict";
let Characteristic, Service;
const cns = require("./../constants"),
  utils = require("./../utils");
module.exports = class deviceBlind {
  constructor(platform) {
    this.platform = platform;
    Service = platform.api.hap.Service;
    Characteristic = platform.api.hap.Characteristic;
  }

  async internalBlindUpdate(accessory, value, callback) {
    callback();
    try {
      let blindConfig,
        params = {},
        wcService = accessory.getService(Service.WindowCovering),
        prevState = accessory.context.cachePositionState,
        prevPosition = accessory.context.cacheCurrentPosition,
        newTarget = value,
        updateKey = Math.random().toString(36).substr(2, 8);
      if (!(blindConfig = this.cusG.get(accessory.context.hbDeviceId))) {
        throw "group config missing";
      }
      if (blindConfig.type !== "blind" || blindConfig.setup !== "twoSwitch") {
        throw "improper configuration";
      }
      if (newTarget === prevPosition) return;
      params.switches = cns.defaultMultiSwitchOff;
      accessory.context.updateKey = updateKey;
      let percentStepPerDecisecond = blindConfig.operationTime / 100;
      if (prevState !== 2) {
        await this.platform.sendDeviceUpdate(accessory, params);
        let positionPercentChange = Math.round(
          Math.floor(Date.now() / 100) - accessory.context.cacheLastStartTime * percentStepPerDecisecond
        );
        if ((prevState === 0 && newTarget > prevPosition) || (prevState === 1 && newTarget < prevPosition)) {
          prevPosition += positionPercentChange;
        } else {
          prevPosition -= positionPercentChange;
        }
        wcService.updateCharacteristic(Characteristic.CurrentPosition, prevPosition);
        accessory.context.cacheCurrentPosition = prevPosition;
      }
      let diffPosition = newTarget - prevPosition;
      let setToMoveUp = diffPosition > 0;
      let decisecondsToMove = Math.round(Math.abs(diffPosition) * percentStepPerDecisecond);
      params.switches[0].switch = setToMoveUp ? "on" : "off";
      params.switches[1].switch = setToMoveUp ? "off" : "on";
      await this.platform.sendDeviceUpdate(accessory, params);
      wcService
        .updateCharacteristic(Characteristic.TargetPosition, newTarget)
        .updateCharacteristic(Characteristic.PositionState, setToMoveUp);
      accessory.context.cacheTargetPosition = newTarget;
      accessory.context.cachePositionState = setToMoveUp;
      accessory.context.cacheLastStartTime = Math.floor(Date.now() / 100);
      this.platform.log.warn(decisecondsToMove + " movement time in deciseconds");
      await utils.sleep(decisecondsToMove * 100);
      if (accessory.context.updateKey === updateKey) {
        params.switches[0].switch = "off";
        params.switches[1].switch = "off";
        await this.platform.sendDeviceUpdate(accessory, params);
        wcService.updateCharacteristic(Characteristic.PositionState, 2);
        wcService.updateCharacteristic(Characteristic.CurrentPosition, newTarget);
        accessory.context.cachePositionState = 2;
        accessory.context.cacheCurrentPosition = newTarget;
      }
    } catch (err) {
      this.platform.requestDeviceRefresh(accessory, err);
    }
  }
};
