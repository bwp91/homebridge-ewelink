/* jshint esversion: 9, -W014, -W030, node: true */
"use strict";
let Characteristic, Service;
const convert = require("color-convert"),
  utils = require("./../utils");
module.exports = class deviceLight {
  constructor(platform) {
    this.platform = platform;
    Service = platform.api.hap.Service;
    Characteristic = platform.api.hap.Characteristic;
  }
  async internalLightbulbUpdate(accessory, value, callback) {
    callback();
    try {
      let oAccessory,
        params = {},
        lightService = accessory.getService(Service.Lightbulb);
      switch (accessory.context.switchNumber) {
        case "X":
          if (accessory.context.eweUIID === 22) {
            //*** B1 ***\\
            params.state = value ? "on" : "off";
          } else {
            params.switch = value ? "on" : "off";
          }
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
                    .getService(Service.Lightbulb)
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
          lightService.updateCharacteristic(Characteristic.On, value);
          break;
        case "0":
          for (let i = 0; i <= 4; i++) {
            if ((oAccessory = this.platform.devicesInHB.get(accessory.context.eweDeviceId + "SW" + i))) {
              oAccessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.On, value);
            }
          }
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          lightService.updateCharacteristic(Characteristic.On, value);
          let masterState = "off";
          for (let i = 1; i <= 4; i++) {
            if ((oAccessory = this.platform.devicesInHB.get(accessory.context.eweDeviceId + "SW" + i))) {
              if (oAccessory.getService(Service.Lightbulb).getCharacteristic(Characteristic.On).value) {
                masterState = "on";
              }
            }
          }
          if (!this.platform.hiddenMasters.includes(accessory.context.eweDeviceId)) {
            oAccessory = this.platform.devicesInHB.get(accessory.context.eweDeviceId + "SW0");
            oAccessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.On, masterState === "on");
          }
          break;
      }
    } catch (err) {
      this.platform.requestDeviceRefresh(accessory, err);
    }
  }
  async internalBrightnessUpdate(accessory, value, callback) {
    callback();
    try {
      let params = {},
        lightService = accessory.getService(Service.Lightbulb);
      if (value === 0) {
        params.switch = "off";
      } else {
        if (!lightService.getCharacteristic(Characteristic.On).value) {
          params.switch = "on";
        }
        switch (accessory.context.eweUIID) {
          case 36: //*** KING-M4 ***\\
            params.bright = Math.round((value * 9) / 10 + 10);
            break;
          case 44: //*** D1 ***\\
            params.brightness = value;
            params.mode = 0;
            break;
        }
      }
      await utils.sleep(250);
      await this.platform.sendDeviceUpdate(accessory, params);
      if (value === 0) {
        lightService.updateCharacteristic(Characteristic.On, false);
      } else {
        lightService.updateCharacteristic(Characteristic.Brightness, value);
      }
    } catch (err) {
      this.platform.requestDeviceRefresh(accessory, err);
    }
  }
  async internalHSBUpdate(accessory, type, value, callback) {
    callback();
    try {
      if (!accessory.context.reachableWAN && !accessory.context.reachableLAN) {
        throw "it is currently offline";
      }
      let newRGB,
        params = {},
        lightService = accessory.getService(Service.Lightbulb),
        curHue = lightService.getCharacteristic(Characteristic.Hue).value,
        curSat = lightService.getCharacteristic(Characteristic.Saturation).value;
      switch (type) {
        case "hue":
          newRGB = convert.hsv.rgb(value, curSat, 100);
          switch (accessory.context.eweUIID) {
            case 22: //*** B1 ***\\
              params = {
                zyx_mode: 2,
                type: "middle",
                channel0: "0",
                channel1: "0",
                channel2: newRGB[0].toString(),
                channel3: newRGB[1].toString(),
                channel4: newRGB[2].toString(),
              };
              break;
            case 59: //*** L1 ***\\
              params = {
                mode: 1,
                colorR: newRGB[0],
                colorG: newRGB[1],
                colorB: newRGB[2],
              };
              break;
          }
          break;
        case "bri":
          switch (accessory.context.eweUIID) {
            case 22: //*** B1 ***\\
              newRGB = convert.hsv.rgb(curHue, curSat, value);
              params = {
                zyx_mode: 2,
                type: "middle",
                channel0: "0",
                channel1: "0",
                channel2: newRGB[0].toString(),
                channel3: newRGB[1].toString(),
                channel4: newRGB[2].toString(),
              };
              break;
            case 59: //*** L1 ***\\
              params = {
                mode: 1,
                bright: value,
              };
              break;
          }
          break;
      }
      await utils.sleep(250);
      await this.platform.sendDeviceUpdate(accessory, params);
      switch (type) {
        case "hue":
          lightService.updateCharacteristic(Characteristic.Hue, value);
          break;
        case "bri":
          lightService.updateCharacteristic(Characteristic.Brightness, value);
          break;
      }
    } catch (err) {
      this.platform.requestDeviceRefresh(accessory, err);
    }
  }
  externalSingleLightUpdate(accessory, params) {
    try {
      let newColour,
        mode,
        isOn = false,
        lightService = accessory.getService(Service.Lightbulb);
      if (accessory.context.eweUIID === 22 && params.hasOwnProperty("state")) {
        isOn = params.state === "on";
      } else if (accessory.context.eweUIID !== 22 && params.hasOwnProperty("switch")) {
        isOn = params.switch === "on";
      } else {
        isOn = lightService.getCharacteristic(Characteristic.On).value;
      }
      if (isOn) {
        lightService.updateCharacteristic(Characteristic.On, true);
        switch (accessory.context.eweUIID) {
          case 36: // KING-M4
            if (params.hasOwnProperty("bright")) {
              let nb = Math.round(((params.bright - 10) * 10) / 9); // eWeLink scale is 10-100 and HomeKit scale is 0-100.
              lightService.updateCharacteristic(Characteristic.Brightness, nb);
            }
            break;
          case 44: // D1
            if (params.hasOwnProperty("brightness")) {
              lightService.updateCharacteristic(Characteristic.Brightness, params.brightness);
            }
            break;
          case 22: // B1
            if (params.hasOwnProperty("zyx_mode")) {
              mode = parseInt(params.zyx_mode);
            } else if (params.hasOwnProperty("channel0") && parseInt(params.channel0) + parseInt(params.channel1) > 0) {
              mode = 1;
            } else {
              mode = 2;
            }
            if (mode === 2) {
              lightService.updateCharacteristic(Characteristic.On, true);
              newColour = convert.rgb.hsv(
                parseInt(params.channel2),
                parseInt(params.channel3),
                parseInt(params.channel4)
              );
              lightService
                .updateCharacteristic(Characteristic.Hue, newColour[0])
                .updateCharacteristic(Characteristic.Saturation, 100)
                .updateCharacteristic(Characteristic.Brightness, 100);
            } else if (mode === 1) {
              throw "has been set to white mode which is not supported";
            }
            break;
          case 59: // L1
            if (params.hasOwnProperty("bright")) {
              lightService.updateCharacteristic(Characteristic.Brightness, params.bright);
            }
            if (params.hasOwnProperty("colorR")) {
              newColour = convert.rgb.hsv(params.colorR, params.colorG, params.colorB);
              lightService
                .updateCharacteristic(Characteristic.Hue, newColour[0])
                .updateCharacteristic(Characteristic.Saturation, newColour[1]);
            }
            break;
          default:
            return;
        }
      } else {
        lightService.updateCharacteristic(Characteristic.On, false);
      }
    } catch (err) {
      this.platform.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
  externalMultiLightUpdate(accessory, params) {
    try {
      let idToCheck = accessory.context.hbDeviceId.slice(0, -1),
        primaryState = false;
      for (let i = 1; i <= accessory.context.channelCount; i++) {
        if (this.platform.devicesInHB.has(idToCheck + i)) {
          let oAccessory = this.platform.devicesInHB.get(idToCheck + i);
          oAccessory
            .getService(Service.Lightbulb)
            .updateCharacteristic(Characteristic.On, params.switches[i - 1].switch === "on");
          if (params.switches[i - 1].switch === "on") {
            primaryState = true;
          }
        }
      }
      if (!this.platform.hiddenMasters.includes(accessory.context.eweDeviceId)) {
        accessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.On, primaryState);
      }
    } catch (err) {
      this.platform.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
};
