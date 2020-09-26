/* jshint esversion: 9, -W014, -W030, node: true */
"use strict";
let Characteristic, Service;
const utils = require("./../utils");
module.exports = class deviceRFSub {
  constructor(platform) {
    this.platform = platform;
    Service = platform.api.hap.Service;
    Characteristic = platform.api.hap.Characteristic;
  }
  async internalRFUpdate(accessory, rfChl, service, callback) {
    callback();
    try {
      let params = {
          cmd: "transmit",
          rfChl: parseInt(rfChl),
        },
        rfService = accessory.getService(service);
      await this.platform.sendDeviceUpdate(accessory, params);
      rfService.updateCharacteristic(Characteristic.On, true);
      await utils.sleep(3000);
      rfService.updateCharacteristic(Characteristic.On, false);
    } catch (err) {
      this.platform.requestDeviceRefresh(accessory, err);
    }
  }
  externalRFUpdate(accessory, params) {
    try {
      if (!params.hasOwnProperty("updateSource")) return;
      let timeNow = new Date(),
        oAccessory = false;
      if (params.hasOwnProperty("cmd") && params.cmd === "transmit" && params.hasOwnProperty("rfChl")) {
        //*** RF Button ***\\
        // the device needed is SW% corresponding to params.rfChl
        this.platform.devicesInHB.forEach(acc => {
          if (
            acc.context.eweDeviceId === accessory.context.eweDeviceId &&
            acc.context.buttons.hasOwnProperty(params.rfChl.toString())
          ) {
            oAccessory = acc;
          }
        });
        if (oAccessory) {
          oAccessory.getService(oAccessory.context.buttons[params.rfChl]).updateCharacteristic(Characteristic.On, 1);
          setTimeout(
            () =>
              oAccessory
                .getService(oAccessory.context.buttons[params.rfChl])
                .updateCharacteristic(Characteristic.On, 0),
            3000
          );
        } else {
          throw "rf button not found in Homebridge";
        }
      } else if (params.hasOwnProperty("cmd") && params.cmd === "trigger") {
        //*** RF Sensor ***\\
        Object.keys(params)
          .filter(name => /rfTrig/.test(name))
          .forEach(chan => {
            this.platform.devicesInHB.forEach(acc => {
              if (
                acc.context.eweDeviceId === accessory.context.eweDeviceId &&
                acc.context.buttons.hasOwnProperty(chan.substr(-1).toString())
              ) {
                oAccessory = acc;
              }
            });
            if (oAccessory) {
              let timeOfMotion = new Date(params[chan]),
                diff = (timeNow.getTime() - timeOfMotion.getTime()) / 1000,
                serv,
                char;
              if (diff < (this.platform.config.sensorTimeDifference || 120)) {
                switch (oAccessory.context.sensorType) {
                  case "button":
                    break;
                  case "water":
                    serv = Service.LeakSensor;
                    char = Characteristic.LeakDetected;
                    break;
                  case "fire":
                  case "smoke":
                    serv = Service.SmokeSensor;
                    char = Characteristic.LeakDetected;
                    break;
                  case "co":
                    serv = Service.CarbonMonoxideSensor;
                    char = Characteristic.CarbonMonoxideDetected;
                    break;
                  case "co2":
                    serv = Service.CarbonDioxideSensor;
                    char = Characteristic.CarbonDioxideDetected;
                    break;
                  case "contact":
                    serv = Service.ContactSensor;
                    char = Characteristic.ContactSensorState;
                    break;
                  case "occupancy":
                    serv = Service.OccupancySensor;
                    char = Characteristic.OccupancyDetected;
                    break;
                  default:
                    serv = Service.MotionSensor;
                    char = Characteristic.MotionDetected;
                    break;
                }
                oAccessory.getService(serv).updateCharacteristic(char, 1);
                setTimeout(() => {
                  oAccessory.getService(serv).updateCharacteristic(char, 0);
                }, (this.platform.config.sensorTimeLength || 2) * 1000);
                if (this.platform.debug) {
                  this.platform.log("[%s] has detected [%s].", oAccessory.displayName, oAccessory.context.sensorType);
                }
              }
            }
          });
      }
    } catch (err) {
      this.platform.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
};
