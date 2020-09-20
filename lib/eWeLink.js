/* jshint esversion: 9, -W030, node: true */
"use strict";
let Accessory, Characteristic, EveService, EveHistoryService, Service, UUIDGen;
const cns = require("./constants"),
  convert = require("color-convert"),
  corrInterval = require("correcting-interval"),
  eWeLinkHTTP = require("./eWeLinkHTTP"),
  eWeLinkWS = require("./eWeLinkWS"),
  eWeLinkLAN = require("./eWeLinkLAN"),
  fakegato = require("fakegato-history"),
  hbLib = require("homebridge-lib");
class eWeLink {
  constructor(log, config, api) {
    if (!log || !api || !config) return;
    if (!config.username || !config.password || !config.countryCode) {
      log.error("*********** Cannot load homebridge-ewelink ***********");
      log.error("eWeLink credentials missing from the Homebridge config.");
      log.error("*******************************************************");
      return;
    }
    this.log = log;
    this.config = config;
    this.api = api;
    this.debug = this.config.debug || false;
    this.devicesInHB = new Map();
    this.devicesInEW = new Map();
    this.cusG = new Map();
    this.cusS = new Map();
    this.hiddenMasters = [];
    this.eveLogPath = this.api.user.storagePath() + "/homebridge-ewelink/";
    this.api
      .on("didFinishLaunching", () => this.eWeLinkSync())
      .on("shutdown", () => {
        if (this.lanClient) this.lanClient.closeConnection();
        if (this.wsClient) this.wsClient.closeConnection();
      });
  }
  eWeLinkSync() {
    this.log("Plugin has finished initialising. Synching with eWeLink.");
    this.httpClient = new eWeLinkHTTP(this.config, this.log);
    this.httpClient
      .getHost()
      .then(() => this.httpClient.login())
      .then(res => {
        this.authData = res;
        return this.httpClient.getDevices();
      })
      .then(res => {
        res.forEach(device => this.devicesInEW.set(device.deviceid, device));
        this.wsClient = new eWeLinkWS(this.config, this.log, this.authData);
        this.lanClient = new eWeLinkLAN(this.config, this.log, res);
        return this.wsClient.getHost();
      })
      .then(() => {
        this.wsClient.login();
        return this.lanClient.getHosts();
      })
      .then(res => {
        this.lanDevices = res.map;
        this.lanCount = res.count;
        return this.lanClient.startMonitor();
      })
      .then(() => {
        (() => {
          //*** Make a map of custom groups from Homebridge config ***\\
          if (Object.keys(this.config.groups || []).length > 0) {
            this.config.groups
              .filter(g => g.hasOwnProperty("type") && cns.allowedGroups.includes(g.type))
              .filter(g => g.hasOwnProperty("deviceId") && this.devicesInEW.has(g.deviceId))
              .forEach(g => this.cusG.set(g.deviceId + "SWX", g));
          }
          //*** Make a map of RF Bridge custom sensors from Homebridge config ***\\
          if (Object.keys(this.config.bridgeSensors || []).length > 0) {
            this.config.bridgeSensors
              .filter(s => s.hasOwnProperty("deviceId") && this.devicesInEW.has(s.deviceId))
              .forEach(s => this.cusS.set(s.fullDeviceId, s));
          }
          //*** Logging always helps to see if everything is okay so far ***\\
          this.log("[%s] eWeLink devices loaded from the Homebridge cache.", this.devicesInHB.size);
          this.log("[%s] primary devices loaded from your eWeLink account.", this.devicesInEW.size);
          this.log("[%s] primary devices were discovered on your local network.", this.lanCount);
          //*** Remove Homebridge accessories that don't appear in eWeLink ***\\
          this.devicesInHB.forEach(a => {
            if (!this.devicesInEW.has(a.context.eweDeviceId)) {
              this.removeAccessory(a);
            }
          });
          //*** Synchronise devices between eWeLink and Homebridge and set up ws/lan listeners ***\\
          this.devicesInEW.forEach(d => this.initialiseDevice(d));
          this.wsClient.receiveUpdate(d => this.receiveDeviceUpdate(d));
          this.lanClient.receiveUpdate(d => this.receiveDeviceUpdate(d));
          this.log("eWeLink sync complete. Don't forget to ⭐️  this plugin on GitHub!");
          if (this.config.debugReqRes || false) {
            this.log.warn("Note: 'Request & Response Logging' is not advised for long-term use.");
          }
        })();
      })
      .catch(err => {
        this.log.error("************** Cannot load homebridge-ewelink **************");
        this.log.error(err);
        this.log.error("************************************************************");
        if (this.lanClient) this.lanClient.closeConnection();
        if (this.wsClient) this.wsClient.closeConnection();
      });
  }
  initialiseDevice(device) {
    let accessory;
    //*** First add the device if it isn't already in Homebridge ***\\

    //*** IRRIGATION VALVES ***\\
    if (
      device.extra.uiid === 2 &&
      device.brandName === "coolkit" &&
      device.productModel === "0285"
    ) {
      accessory = this.devicesInHB.has(device.deviceid + "SWX")
        ? this.devicesInHB.get(device.deviceid + "SWX")
        : this.addAccessory(device, device.deviceid + "SWX", "valve");
    }

    //*** WINDOW BLINDS ***\\
    else if (
      this.cusG.has(device.deviceid + "SWX") &&
      this.cusG.get(device.deviceid + "SWX").type === "blind"
    ) {
      accessory = this.devicesInHB.has(device.deviceid + "SWX")
        ? this.devicesInHB.get(device.deviceid + "SWX")
        : this.addAccessory(device, device.deviceid + "SWX", "blind");
    }

    //*** GARAGES ***\\
    else if (
      this.cusG.has(device.deviceid + "SWX") &&
      this.cusG.get(device.deviceid + "SWX").type === "garage"
    ) {
      accessory = this.devicesInHB.has(device.deviceid + "SWX")
        ? this.devicesInHB.get(device.deviceid + "SWX")
        : this.addAccessory(device, device.deviceid + "SWX", "garage");
    }

    //*** LOCKS ***\\
    else if (
      this.cusG.has(device.deviceid + "SWX") &&
      this.cusG.get(device.deviceid + "SWX").type === "lock"
    ) {
      accessory = this.devicesInHB.has(device.deviceid + "SWX")
        ? this.devicesInHB.get(device.deviceid + "SWX")
        : this.addAccessory(device, device.deviceid + "SWX", "lock");
    }

    //*** DW2 SENSORS ***\\
    else if (cns.devicesSensor.includes(device.extra.uiid)) {
      accessory = this.devicesInHB.has(device.deviceid + "SWX")
        ? this.devicesInHB.get(device.deviceid + "SWX")
        : this.addAccessory(device, device.deviceid + "SWX", "sensor");
    }

    //*** FANS ***\\
    else if (cns.devicesFan.includes(device.extra.uiid)) {
      accessory = this.devicesInHB.has(device.deviceid + "SWX")
        ? this.devicesInHB.get(device.deviceid + "SWX")
        : this.addAccessory(device, device.deviceid + "SWX", "fan");
    }

    //*** THERMOSTATS ***\\
    else if (cns.devicesThermostat.includes(device.extra.uiid)) {
      accessory = this.devicesInHB.has(device.deviceid + "SWX")
        ? this.devicesInHB.get(device.deviceid + "SWX")
        : this.addAccessory(device, device.deviceid + "SWX", "thermostat");
    }

    //*** OUTLETS ***\\
    else if (cns.devicesOutlet.includes(device.extra.uiid)) {
      accessory = this.devicesInHB.has(device.deviceid + "SWX")
        ? this.devicesInHB.get(device.deviceid + "SWX")
        : this.addAccessory(device, device.deviceid + "SWX", "outlet");
    }

    //*** USB OUTLETS ***\\
    else if (cns.devicesUSB.includes(device.extra.uiid)) {
      accessory = this.devicesInHB.has(device.deviceid + "SWX")
        ? this.devicesInHB.get(device.deviceid + "SWX")
        : this.addAccessory(device, device.deviceid + "SWX", "usb");
    }

    //*** SINGLE CHANNEL [MULTI CHANNEL HARDWARE] ***\\
    else if (cns.devicesSCM.includes(device.extra.uiid)) {
      accessory = this.devicesInHB.has(device.deviceid + "SWX")
        ? this.devicesInHB.get(device.deviceid + "SWX")
        : this.addAccessory(device, device.deviceid + "SWX", "scm");
    }

    //*** SINGLE CHANNEL LIGHTS ***\\
    else if (
      cns.devicesSingleSwitch.includes(device.extra.uiid) &&
      cns.devicesSingleSwitchLight.includes(device.productModel)
    ) {
      accessory = this.devicesInHB.has(device.deviceid + "SWX")
        ? this.devicesInHB.get(device.deviceid + "SWX")
        : this.addAccessory(device, device.deviceid + "SWX", "light");
    }

    //*** MULTI CHANNEL LIGHTS ***\\
    else if (
      cns.devicesMultiSwitch.includes(device.extra.uiid) &&
      cns.devicesMultiSwitchLight.includes(device.productModel)
    ) {
      if (this.config.hideMasters) {
        if (this.devicesInHB.has(device.deviceid + "SW0")) {
          this.removeAccessory(this.devicesInHB.get(device.deviceid + "SW0"));
        }
        this.hiddenMasters.push(device.deviceid);
        accessory = this.addAccessory(device, device.deviceid + "SW0", "light", true);
      } else {
        accessory = this.devicesInHB.has(device.deviceid + "SW0")
          ? this.devicesInHB.get(device.deviceid + "SW0")
          : this.addAccessory(device, device.deviceid + "SW0", "light");
      }
      for (let i = 1; i <= cns.chansFromUiid[device.extra.uiid]; i++) {
        if ((this.config.hideFromHB || "").includes(device.deviceid + "SW" + i)) {
          if (this.devicesInHB.has(device.deviceid + "SW" + i)) {
            this.removeAccessory(this.devicesInHB.get(device.deviceid + "SW" + i));
          }
        } else {
          let oAccessory = this.devicesInHB.has(device.deviceid + "SW" + i)
            ? this.devicesInHB.get(device.deviceid + "SW" + i)
            : this.addAccessory(device, device.deviceid + "SW" + i, "light");
          oAccessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.FirmwareRevision, device.params.fwVersion);
          oAccessory.context.reachableWAN = device.online;
          oAccessory.context.reachableLAN = this.lanDevices.get(device.deviceid).online || false;
          this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory);
        }
      }
    }

    //*** SINGLE CHANNEL SWITCHES ***\\
    else if (cns.devicesSingleSwitch.includes(device.extra.uiid)) {
      accessory = this.devicesInHB.has(device.deviceid + "SWX")
        ? this.devicesInHB.get(device.deviceid + "SWX")
        : this.addAccessory(device, device.deviceid + "SWX", "switch");
    }

    //*** MULTI CHANNEL SWITCHES ***\\
    else if (cns.devicesMultiSwitch.includes(device.extra.uiid)) {
      if (this.config.hideMasters) {
        if (this.devicesInHB.has(device.deviceid + "SW0")) {
          this.removeAccessory(this.devicesInHB.get(device.deviceid + "SW0"));
        }
        this.hiddenMasters.push(device.deviceid);
        accessory = this.addAccessory(device, device.deviceid + "SW0", "switch", true);
      } else {
        accessory = this.devicesInHB.has(device.deviceid + "SW0")
          ? this.devicesInHB.get(device.deviceid + "SW0")
          : this.addAccessory(device, device.deviceid + "SW0", "switch");
      }
      for (let i = 1; i <= cns.chansFromUiid[device.extra.uiid]; i++) {
        if ((this.config.hideFromHB || "").includes(device.deviceid + "SW" + i)) {
          if (this.devicesInHB.has(device.deviceid + "SW" + i)) {
            this.removeAccessory(this.devicesInHB.get(device.deviceid + "SW" + i));
          }
        } else {
          let oAccessory = this.devicesInHB.has(device.deviceid + "SW" + i)
            ? this.devicesInHB.get(device.deviceid + "SW" + i)
            : this.addAccessory(device, device.deviceid + "SW" + i, "switch");
          oAccessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.FirmwareRevision, device.params.fwVersion);
          oAccessory.context.reachableWAN = device.online;
          oAccessory.context.reachableLAN = this.lanDevices.get(device.deviceid).online || false;
          this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory);
        }
      }
    }

    //*** RF BRIDGES ***\\
    else if (cns.devicesRFBridge.includes(device.extra.uiid)) {
      accessory = this.devicesInHB.has(device.deviceid + "SW0")
        ? this.devicesInHB.get(device.deviceid + "SW0")
        : this.addAccessory(device, device.deviceid + "SW0", "rf_pri");
      if (Object.keys((device.tags && device.tags.zyx_info) || []).length > 0) {
        let rfBridgeChange = false;
        for (let i = 1; i <= Object.keys(device.tags.zyx_info).length; i++) {
          let oAccessory = this.devicesInHB.has(device.deviceid + "SW" + i)
            ? this.devicesInHB.get(device.deviceid + "SW" + i)
            : this.addAccessory(device, device.deviceid + "SW" + i, "rf_sub");
          oAccessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.FirmwareRevision, device.params.fwVersion);
          oAccessory.context.reachableWAN = device.online;
          oAccessory.context.reachableLAN = this.lanDevices.get(device.deviceid).online || false;
          this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory);
          if (oAccessory.context.sensorType !== "button" && !rfBridgeChange) {
            let ct = this.cusS.has(oAccessory.context.hbDeviceId)
              ? this.cusS.get(oAccessory.context.hbDeviceId).type
              : "motion";
            if (ct !== oAccessory.context.sensorType) rfBridgeChange = true;
          }
        }
        if (rfBridgeChange) {
          this.log.warn(
            "[%s] bridge configuration changed so devices will be removed and readded.",
            accessory.displayName
          );
          for (let i = 0; i <= accessory.context.channelCount; i++) {
            let oAccessory = this.devicesInHB.get(device.deviceid + "SW" + i);
            this.removeAccessory(oAccessory);
          }
          this.initialiseDevice(device);
          return;
        }
      }
    }

    //*** ZIGBEE BRIDGES ***\\
    else if (cns.devicesZBBridge.includes(device.extra.uiid)) {
      accessory = this.devicesInHB.has(device.deviceid + "SWX")
        ? this.devicesInHB.get(device.deviceid + "SWX")
        : this.addAccessory(device, device.deviceid + "SWX", "zb_pri");
    }

    //*** ZIGBEE DEVICES ***\\
    else if (cns.devicesZB.includes(device.extra.uiid)) {
      accessory = this.devicesInHB.has(device.deviceid + "SWX")
        ? this.devicesInHB.get(device.deviceid + "SWX")
        : this.addAccessory(device, device.deviceid + "SWX", "zb_sub");
    }

    //*** SONOFF CAMERAS ***\\
    else if (cns.devicesCamera.includes(device.extra.uiid)) {
      this.log.warn(
        ' → [%s] please see "https://github.com/bwp91/homebridge-ewelink/wiki/How-to-set-up-Sonoff-Camera".',
        device.name
      );
      return;
    }

    //*** ALL OTHER = UNSUPPORTED ***\\
    else {
      this.log.warn(
        " → [%s] cannot be added as it is not supported by this plugin. Please make a GitHub issue request.",
        device.name
      );
      return;
    }

    if (!accessory) {
      return;
    }
    //*** Next refresh the device ***\\
    if (!this.hiddenMasters.includes(device.deviceid)) {
      accessory
        .getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.FirmwareRevision, device.params.fwVersion);
    }
    accessory.context.reachableWAN = device.online;
    accessory.context.reachableLAN = this.lanDevices.get(device.deviceid).online || false;
    accessory.context.inUse = false;

    let str = accessory.context.reachableLAN
      ? "and found locally with IP [" + this.lanDevices.get(device.deviceid).ip + "]"
      : "but LAN mode unavailable as device ";
    if (!accessory.context.reachableLAN) {
      if (cns.devicesNonLAN.includes(device.extra.uiid)) {
        str += "doesn't support it";
      } else if (device.hasOwnProperty("sharedBy") && device.sharedBy.hasOwnProperty("email")) {
        str += "is shared (" + device.sharedBy.email + ")";
      } else {
        str += "is unreachable";
      }
    }

    this.log(" → [%s] initialised %s.", device.name, str);
    this.devicesInHB.set(accessory.context.hbDeviceId, accessory);

    if (!this.refreshAccessory(accessory, device.params)) {
      this.log.warn(
        "[%s] could not be initialised. Please try removing accessory from the Homebridge cache along with any secondary devices (SW1, SW2, etc.) [debug:%s:%s].",
        accessory.displayName,
        accessory.context.type,
        accessory.context.channelCount
      );
    }
  }
  addAccessory(device, hbDeviceId, type, hidden = false) {
    let switchNumber = hbDeviceId.substr(-1).toString(),
      newDeviceName = type === "rf_sub" ? device.tags.zyx_info[switchNumber - 1].name : device.name,
      channelCount =
        type === "rf_pri"
          ? Object.keys((device.tags && device.tags.zyx_info) || []).length
          : cns.chansFromUiid[device.extra.uiid];
    if (["1", "2", "3", "4"].includes(switchNumber) && type !== "rf_sub") {
      newDeviceName += " SW" + switchNumber;
    }
    if ((this.config.nameOverride || {}).hasOwnProperty(hbDeviceId)) {
      newDeviceName = this.config.nameOverride[hbDeviceId];
    }
    try {
      const accessory = new Accessory(newDeviceName, UUIDGen.generate(hbDeviceId).toString());
      if (!hidden) {
        accessory
          .getService(Service.AccessoryInformation)
          .setCharacteristic(Characteristic.SerialNumber, hbDeviceId)
          .setCharacteristic(Characteristic.Manufacturer, device.brandName)
          .setCharacteristic(
            Characteristic.Model,
            device.productModel + " (" + device.extra.model + ")"
          )
          .setCharacteristic(Characteristic.FirmwareRevision, device.params.fwVersion)
          .setCharacteristic(Characteristic.Identify, false);
      }
      accessory.context = {
        hbDeviceId,
        eweDeviceId: device.deviceid,
        eweUIID: device.extra.uiid,
        eweModel: device.productModel,
        eweApiKey: device.apikey,
        switchNumber,
        channelCount,
        type,
      };
      if (!hidden) {
        this.api.registerPlatformAccessories("homebridge-ewelink", "eWeLink", [accessory]);
        this.configureAccessory(accessory);
        this.log(" → [%s] has been added to Homebridge.", newDeviceName);
      }
      return accessory;
    } catch (err) {
      this.log.warn(" → [%s] could not be added as %s.", newDeviceName, err);
      return false;
    }
  }
  configureAccessory(accessory) {
    if (!this.log) return;
    try {
      accessory.context.reachableWAN = true;
      accessory.context.reachableLAN = true;
      switch (accessory.context.type) {
        case "valve":
          ["A", "B"].forEach(v => {
            let valveService;
            if (!(valveService = accessory.getService("Valve " + v))) {
              accessory
                .addService(Service.Valve, "Valve " + v, "valve" + v.toLowerCase())
                .setCharacteristic(Characteristic.Active, 0)
                .setCharacteristic(Characteristic.InUse, 0)
                .setCharacteristic(Characteristic.ValveType, 1)
                .setCharacteristic(Characteristic.SetDuration, this.config.valveTimeLength || 120)
                .addCharacteristic(Characteristic.RemainingDuration);
              valveService = accessory.getService("Valve " + v);
            }
            valveService
              .getCharacteristic(Characteristic.Active)
              .on("set", (value, callback) =>
                this.internalValveUpdate(accessory, "Valve " + v, value, callback)
              );
            valveService
              .getCharacteristic(Characteristic.SetDuration)
              .on("set", (value, callback) => {
                if (valveService.getCharacteristic(Characteristic.InUse).value) {
                  valveService.updateCharacteristic(Characteristic.RemainingDuration, value);
                  clearTimeout(valveService.timer);
                  valveService.timer = setTimeout(() => {
                    valveService.setCharacteristic(Characteristic.Active, 0);
                  }, value * 1000);
                }
                callback();
              });
          });
          break;
        case "blind":
          let wcService;
          if (!(wcService = accessory.getService(Service.WindowCovering))) {
            accessory
              .addService(Service.WindowCovering)
              .setCharacteristic(Characteristic.CurrentPosition, 100)
              .setCharacteristic(Characteristic.TargetPosition, 100)
              .setCharacteristic(Characteristic.PositionState, 2);
            wcService = accessory.getService(Service.WindowCovering);
          }
          wcService
            .getCharacteristic(Characteristic.TargetPosition)
            .on("set", (value, callback) => this.internalBlindUpdate(accessory, value, callback))
            .setProps({
              minStep: 100,
            });
          break;
        case "garage":
          let gdService;
          if (!(gdService = accessory.getService(Service.GarageDoorOpener))) {
            accessory
              .addService(Service.GarageDoorOpener)
              .setCharacteristic(Characteristic.CurrentDoorState, 1)
              .setCharacteristic(Characteristic.TargetDoorState, 1)
              .setCharacteristic(Characteristic.ObstructionDetected, false);
            gdService = accessory.getService(Service.GarageDoorOpener);
          }
          gdService
            .getCharacteristic(Characteristic.TargetDoorState)
            .on("set", (value, callback) => this.internalGarageUpdate(accessory, value, callback));
          break;
        case "lock":
          let lmService =
            accessory.getService(Service.LockMechanism) ||
            accessory.addService(Service.LockMechanism);
          lmService
            .getCharacteristic(Characteristic.LockTargetState)
            .on("set", (value, callback) => this.internalLockUpdate(accessory, value, callback));
          break;
        case "sensor":
          accessory.getService(Service.ContactSensor) ||
            accessory.addService(Service.ContactSensor);
          accessory.getService(Service.BatteryService) ||
            accessory.addService(Service.BatteryService);
          break;
        case "fan":
          let fanService =
              accessory.getService(Service.Fanv2) || accessory.addService(Service.Fanv2),
            fanLightService =
              accessory.getService(Service.Lightbulb) || accessory.addService(Service.Lightbulb);
          fanService
            .getCharacteristic(Characteristic.Active)
            .on("set", (value, callback) =>
              this.internalFanUpdate(accessory, "power", value, callback)
            );
          fanService
            .getCharacteristic(Characteristic.RotationSpeed)
            .on("set", (value, callback) =>
              this.internalFanUpdate(accessory, "speed", value, callback)
            )
            .setProps({
              minStep: 33,
            });
          fanLightService
            .getCharacteristic(Characteristic.On)
            .on("set", (value, callback) =>
              this.internalFanUpdate(accessory, "light", value, callback)
            );
          break;
        case "thermostat":
          let tempService =
              accessory.getService(Service.TemperatureSensor) ||
              accessory.addService(Service.TemperatureSensor),
            humiService = false;
          if (this.devicesInEW.get(accessory.context.eweDeviceId).params.sensorType !== "DS18B20") {
            humiService =
              accessory.getService(Service.HumiditySensor) ||
              accessory.addService(Service.HumiditySensor);
          }
          if (!this.config.hideTHSwitch) {
            let switchService =
              accessory.getService(Service.Switch) || accessory.addService(Service.Switch);
            switchService
              .getCharacteristic(Characteristic.On)
              .on("set", (value, callback) =>
                this.internalThermostatUpdate(accessory, value, callback)
              );
          }
          accessory.log = this.log;
          accessory.eveLogger = new EveHistoryService("weather", accessory, {
            storage: "fs",
            minutes: 5,
            path: this.eveLogPath,
          });
          corrInterval.setCorrectingInterval(() => {
            let dataToAdd = {
              time: Date.now(),
              temp: tempService.getCharacteristic(Characteristic.CurrentTemperature).value,
            };
            if (humiService) {
              humiService.getCharacteristic(Characteristic.CurrentRelativeHumidity).value;
            }
            accessory.eveLogger.addEntry(dataToAdd);
          }, 300000);
          break;
        case "outlet":
          let outletService;
          if (!(outletService = accessory.getService(Service.Outlet))) {
            accessory.addService(Service.Outlet);
            outletService = accessory.getService(Service.Outlet);
            outletService.addCharacteristic(EveService.Characteristics.Voltage);
            outletService.addCharacteristic(EveService.Characteristics.CurrentConsumption);
            outletService.addCharacteristic(EveService.Characteristics.ElectricCurrent);
            outletService.addCharacteristic(EveService.Characteristics.TotalConsumption);
            outletService.addCharacteristic(EveService.Characteristics.ResetTotal);
            accessory.context = {
              ...accessory.context,
              ...{
                extraPersistedData: {},
                lastReset: 0,
                totalEnergy: 0,
                totalEnergyTemp: 0,
              },
            };
          }
          outletService
            .getCharacteristic(Characteristic.On)
            .on("set", (value, callback) => this.internalOutletUpdate(accessory, value, callback));
          accessory.log = this.log;
          accessory.eveLogger = new EveHistoryService("energy", accessory, {
            storage: "fs",
            minutes: 5,
            path: this.eveLogPath,
          });
          corrInterval.setCorrectingInterval(() => {
            let isOn = outletService.getCharacteristic(Characteristic.On).value,
              currentWatt = isOn
                ? outletService.getCharacteristic(EveService.Characteristics.CurrentConsumption)
                    .value
                : 0;
            if (accessory.eveLogger.isHistoryLoaded()) {
              accessory.context.extraPersistedData = accessory.eveLogger.getExtraPersistedData();
              if (accessory.context.extraPersistedData !== undefined) {
                accessory.context.totalEnergy =
                  accessory.context.extraPersistedData.totalenergy +
                  accessory.context.totalEnergyTemp +
                  (currentWatt * 10) / 3600 / 1000;
                accessory.eveLogger.setExtraPersistedData({
                  totalenergy: accessory.context.totalEnergy,
                  lastReset: accessory.context.extraPersistedData.lastReset,
                });
              } else {
                accessory.context.totalEnergy =
                  accessory.context.totalEnergyTemp + (currentWatt * 10) / 3600 / 1000;
                accessory.eveLogger.setExtraPersistedData({
                  totalenergy: accessory.context.totalEnergy,
                  lastReset: 0,
                });
              }
              accessory.context.totalEnergytemp = 0;
            } else {
              accessory.context.totalEnergyTemp += (currentWatt * 10) / 3600 / 1000;
              accessory.context.totalEnergy = accessory.context.totalEnergyTemp;
            }
            accessory.eveLogger.addEntry({
              time: Date.now(),
              power: currentWatt,
            });
          }, 300000);
          outletService
            .getCharacteristic(EveService.Characteristics.TotalConsumption)
            .on("get", callback => {
              accessory.context.extraPersistedData = accessory.eveLogger.getExtraPersistedData();
              if (accessory.context.extraPersistedData !== undefined) {
                accessory.context.totalEnergy = accessory.context.extraPersistedData.totalPower;
              }
              callback(null, accessory.context.totalEnergy);
            });
          outletService
            .getCharacteristic(EveService.Characteristics.ResetTotal)
            .on("set", (value, callback) => {
              accessory.context.totalEnergy = 0;
              accessory.context.lastReset = value;
              accessory.eveLogger.setExtraPersistedData({
                totalPower: 0,
                lastReset: value,
              });
              callback();
            })
            .on("get", callback => {
              accessory.context.extraPersistedData = accessory.eveLogger.getExtraPersistedData();
              if (accessory.context.extraPersistedData !== undefined) {
                accessory.context.lastReset = accessory.context.extraPersistedData.lastReset;
              }
              callback(null, accessory.context.lastReset);
            });
          break;
        case "usb":
          let usbService =
            accessory.getService(Service.Outlet) || accessory.addService(Service.Outlet);
          usbService
            .getCharacteristic(Characteristic.On)
            .on("set", (value, callback) => this.internalUSBUpdate(accessory, value, callback));
          break;
        case "scm":
          let scmService =
            accessory.getService(Service.Switch) || accessory.addService(Service.Switch);
          scmService
            .getCharacteristic(Characteristic.On)
            .on("set", (value, callback) => this.internalSCMUpdate(accessory, value, callback));
          break;
        case "light":
          let lightService =
            accessory.getService(Service.Lightbulb) || accessory.addService(Service.Lightbulb);
          lightService
            .getCharacteristic(Characteristic.On)
            .on("set", (value, callback) =>
              this.internalLightbulbUpdate(accessory, value, callback)
            );
          if (cns.devicesBrightable.includes(accessory.context.eweUIID)) {
            lightService
              .getCharacteristic(Characteristic.Brightness)
              .on("set", (value, callback) => {
                if (value > 0) {
                  if (!lightService.getCharacteristic(Characteristic.On).value) {
                    this.internalLightbulbUpdate(accessory, true, function () {
                      return;
                    });
                  }
                  this.internalBrightnessUpdate(accessory, value, callback);
                } else {
                  this.internalLightbulbUpdate(accessory, false, callback);
                }
              });
          } else if (cns.devicesColourable.includes(accessory.context.eweUIID)) {
            lightService
              .getCharacteristic(Characteristic.Brightness)
              .on("set", (value, callback) => {
                if (value > 0) {
                  if (!lightService.getCharacteristic(Characteristic.On).value) {
                    this.internalLightbulbUpdate(accessory, true, function () {
                      return;
                    });
                  }
                  this.internalHSBUpdate(accessory, "bri", value, callback);
                } else {
                  this.internalLightbulbUpdate(accessory, false, callback);
                }
              });
            lightService
              .getCharacteristic(Characteristic.Hue)
              .on("set", (value, callback) =>
                this.internalHSBUpdate(accessory, "hue", value, callback)
              );
            lightService
              .getCharacteristic(Characteristic.Saturation)
              .on("set", (value, callback) => callback());
          }
          break;
        case "switch":
          let switchService =
            accessory.getService(Service.Switch) || accessory.addService(Service.Switch);
          switchService
            .getCharacteristic(Characteristic.On)
            .on("set", (value, callback) => this.internalSwitchUpdate(accessory, value, callback));
          break;
        case "rf_pri":
          if (!accessory.context.hasOwnProperty("rfChlMap")) {
            accessory.context.rfChlMap = {};
          }
          break;
        case "rf_sub":
          if (!accessory.context.hasOwnProperty("rfChls")) {
            accessory.context.rfChls = {};
          }
          switch (
            this.devicesInEW.get(accessory.context.eweDeviceId).tags.zyx_info[
              parseInt(accessory.context.switchNumber) - 1
            ].remote_type
          ) {
            case "1":
            case "2":
            case "3":
            case "4":
              accessory.context.sensorType = "button";
              break;
            case "6":
              accessory.context.sensorType = this.cusS.has(accessory.context.hbDeviceId)
                ? this.cusS.get(accessory.context.hbDeviceId).type
                : "motion";
              break;
          }
          let mAccessory = this.devicesInHB.get(accessory.context.eweDeviceId + "SW0");
          this.devicesInEW
            .get(mAccessory.context.eweDeviceId)
            .tags.zyx_info[parseInt(accessory.context.switchNumber) - 1].buttonName.forEach(
              button => {
                let rfData;
                Object.entries(button).forEach(
                  ([k, v]) =>
                    (rfData = {
                      rfChan: k,
                      name: v,
                    })
                );
                accessory.context.rfChls[rfData.rfChan] = rfData.name;
                mAccessory.context.rfChlMap[rfData.rfChan] = accessory.context.switchNumber;
                this.devicesInHB.set(mAccessory.context.hbDeviceId, mAccessory);
                switch (accessory.context.sensorType) {
                  case "button":
                    accessory.getService(rfData.name) ||
                      accessory.addService(Service.Switch, rfData.name, "switch" + rfData.rfChan);
                    break;
                  case "water":
                    accessory.getService(Service.LeakSensor) ||
                      accessory.addService(Service.LeakSensor);
                    break;
                  case "fire":
                  case "smoke":
                    accessory.getService(Service.SmokeSensor) ||
                      accessory.addService(Service.SmokeSensor);
                    break;
                  case "co":
                    accessory.getService(Service.CarbonMonoxideSensor) ||
                      accessory.addService(Service.CarbonMonoxideSensor);
                    break;
                  case "co2":
                    accessory.getService(Service.CarbonDioxideSensor) ||
                      accessory.addService(Service.CarbonDioxideSensor);
                    break;
                  case "contact":
                    accessory.getService(Service.ContactSensor) ||
                      accessory.addService(Service.ContactSensor);
                    break;
                  case "occupancy":
                    accessory.getService(Service.OccupancySensor) ||
                      accessory.addService(Service.OccupancySensor);
                    break;
                  default:
                    accessory.getService(Service.MotionSensor) ||
                      accessory.addService(Service.MotionSensor);
                    break;
                }
              }
            );
          accessory.context.rfChls = accessory.context.rfChls || {};
          if (accessory.context.sensorType === "button") {
            Object.entries(accessory.context.rfChls).forEach(([k, v]) => {
              accessory.getService(v).updateCharacteristic(Characteristic.On, false);
              accessory
                .getService(v)
                .getCharacteristic(Characteristic.On)
                .on("set", (value, callback) => {
                  value ? this.internalRFDeviceUpdate(accessory, k, callback) : callback();
                });
            });
          }

          break;
        case "zb_sub": //*** credit @tasict ***\\
          accessory.getService(Service.BatteryService) ||
            accessory.addService(Service.BatteryService);
          switch (accessory.context.eweUIID) {
            case 1000:
              let zbspsService =
                accessory.getService(Service.StatelessProgrammableSwitch) ||
                accessory.addService(Service.StatelessProgrammableSwitch);
              if (this.config.hideZBLDPress) {
                zbspsService.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setProps({
                  validValues: [0],
                });
              }
              break;
            case 1770:
              let zbTempService =
                accessory.getService(Service.TemperatureSensor) ||
                accessory.addService(Service.TemperatureSensor);
              let zbHumiService =
                accessory.getService(Service.HumiditySensor) ||
                accessory.addService(Service.HumiditySensor);
              accessory.log = this.log;
              accessory.eveLogger = new EveHistoryService("weather", accessory, {
                storage: "fs",
                minutes: 5,
                path: this.eveLogPath,
              });
              corrInterval.setCorrectingInterval(() => {
                let dataToAdd = {
                  time: Date.now(),
                  temp: zbTempService.getCharacteristic(Characteristic.CurrentTemperature).value,
                  humidity: zbHumiService.getCharacteristic(Characteristic.CurrentRelativeHumidity)
                    .value,
                };
                accessory.eveLogger.addEntry(dataToAdd);
              }, 300000);
              break;
            case 2026:
              accessory.getService(Service.MotionSensor) ||
                accessory.addService(Service.MotionSensor);
              break;
            case 3026:
              accessory.getService(Service.ContactSensor) ||
                accessory.addService(Service.ContactSensor);
              break;
          }
          break;
      }
      this.devicesInHB.set(accessory.context.hbDeviceId, accessory);
    } catch (err) {
      this.log.warn("[%s] could not be refreshed as %s.", accessory.displayName, err);
    }
  }
  refreshAccessory(accessory, newParams) {
    switch (accessory.context.type) {
      case "valve":
        if (
          Object.keys(newParams).some(v => cns.devicesValveParams.includes(v)) &&
          Array.isArray(newParams.switches)
        ) {
          this.externalValveUpdate(accessory, newParams);
        }
        return true;
      case "blind":
        if (
          Object.keys(newParams).some(v => cns.devicesBlindParams.includes(v)) &&
          Array.isArray(newParams.switches)
        ) {
          this.externalBlindUpdate(accessory, newParams);
        }
        return true;
      case "garage":
        if (
          Object.keys(newParams).some(v => cns.devicesGarageParams.includes(v)) &&
          Array.isArray(newParams.switches)
        ) {
          this.externalGarageUpdate(accessory, newParams);
        }
        return true;
      case "lock":
        if (Object.keys(newParams).some(v => cns.devicesLockParams.includes(v))) {
          this.externalLockUpdate(accessory, newParams);
        }
        return true;
      case "sensor":
        if (Object.keys(newParams).some(v => cns.devicesSensorParams.includes(v))) {
          this.externalSensorUpdate(accessory, newParams);
        }
        return true;
      case "fan":
        if (Object.keys(newParams).some(v => cns.devicesFanParams.includes(v))) {
          this.externalFanUpdate(accessory, newParams);
        }
        return true;
      case "thermostat":
        if (Object.keys(newParams).some(v => cns.devicesThermostatParams.includes(v))) {
          this.externalThermostatUpdate(accessory, newParams);
        }
        return true;
      case "outlet":
        if (Object.keys(newParams).some(v => cns.devicesOutletParams.includes(v))) {
          this.externalOutletUpdate(accessory, newParams);
        }
        return true;
      case "usb":
        if (
          Object.keys(newParams).some(v => cns.devicesUSBParams.includes(v)) &&
          Array.isArray(newParams.switches)
        ) {
          this.externalUSBUpdate(accessory, newParams);
        }
        return true;
      case "scm":
        if (
          Object.keys(newParams).some(v => cns.devicesSCMParams.includes(v)) &&
          Array.isArray(newParams.switches)
        ) {
          this.externalSCMUpdate(accessory, newParams);
        }
        return true;
      case "light":
        if (
          cns.devicesSingleSwitch.includes(accessory.context.eweUIID) &&
          cns.devicesSingleSwitchLight.includes(accessory.context.eweModel)
        ) {
          if (Object.keys(newParams).some(v => cns.devicesSingleSwitchLightParams.includes(v))) {
            this.externalSingleLightUpdate(accessory, newParams);
          }
        } else if (
          cns.devicesMultiSwitch.includes(accessory.context.eweUIID) &&
          cns.devicesMultiSwitchLight.includes(accessory.context.eweModel)
        ) {
          if (
            Object.keys(newParams).some(v => cns.devicesMultiSwitchLightParams.includes(v)) &&
            Array.isArray(newParams.switches)
          ) {
            this.externalMultiLightUpdate(accessory, newParams);
          }
        }
        return true;
      case "switch":
        if (cns.devicesSingleSwitch.includes(accessory.context.eweUIID)) {
          if (Object.keys(newParams).some(v => cns.devicesSingleSwitchParams.includes(v))) {
            this.externalSingleSwitchUpdate(accessory, newParams);
          }
        } else if (cns.devicesMultiSwitch.includes(accessory.context.eweUIID)) {
          if (
            Object.keys(newParams).some(v => cns.devicesMultiSwitchParams.includes(v)) &&
            Array.isArray(newParams.switches)
          ) {
            this.externalMultiSwitchUpdate(accessory, newParams);
          }
        }
        return true;
      case "rf_pri":
        if (Object.keys(newParams).some(v => cns.devicesRFBridgeParams.includes(v))) {
          this.externalRFDeviceUpdate(accessory, newParams);
        }
        return true;
      case "rf_sub":
      case "zb_pri":
        return true;
      case "zb_sub":
        if (Object.keys(newParams).some(v => cns.devicesZBBridgeParams.includes(v))) {
          this.externalZBDeviceUpdate(accessory, newParams);
        }
        return true;
      default:
        return false;
    }
  }
  removeAccessory(accessory) {
    try {
      this.api.unregisterPlatformAccessories("homebridge-ewelink", "eWeLink", [accessory]);
      this.devicesInHB.delete(accessory.context.hbDeviceId);
      this.log(" → [%s] was removed from Homebridge.", accessory.displayName);
    } catch (err) {
      this.log.warn(" → [%s] wasn't removed as %s.", accessory.displayName, err);
    }
  }
  sendDeviceUpdate(accessory, params, callback) {
    let payload = {
      apikey: accessory.context.eweApiKey,
      deviceid: accessory.context.eweDeviceId,
      params,
    };
    let sendViaWS = () => {
      if (accessory.context.reachableWAN) {
        this.wsClient
          .sendUpdate(payload)
          .then(() => callback())
          .catch(err => callback(err));
      } else {
        this.log.error(
          "[%s] could not be updated as it appears to be offline.",
          accessory.displayName
        );
        callback("Device has failed to update");
      }
    };
    if (cns.devicesNonLAN.includes(accessory.context.eweUIID) || !accessory.context.reachableLAN) {
      sendViaWS();
    } else {
      this.lanClient
        .sendUpdate(payload)
        .then(() => callback())
        .catch(err => {
          if (this.debug) {
            this.log.warn("[%s] Reverting to web socket as %s.", accessory.displayName, err);
          }
          sendViaWS();
        });
    }
  }
  receiveDeviceUpdate(device) {
    let accessory,
      deviceId = device.deviceid,
      reachableChange = false;
    if (
      (accessory = this.devicesInHB.get(deviceId + "SWX") || this.devicesInHB.get(deviceId + "SW0"))
    ) {
      let isX = accessory.context.hbDeviceId.substr(-1) === "X";
      if (device.params.updateSource === "WS") {
        if (device.params.online != accessory.context.reachableWAN) {
          accessory.context.reachableWAN = device.params.online;
          this.devicesInHB.set(accessory.context.hbDeviceId, accessory);
          if (accessory.context.reachableWAN)
            this.wsClient.requestUpdate(accessory).catch(() => {});
          reachableChange = true;
          this.log.warn(
            "[%s] has been reported [%s] via [WS].",
            accessory.displayName,
            accessory.context.reachableWAN ? "online" : "offline"
          );
        }
      }
      if (device.params.updateSource === "LAN" && !accessory.context.reachableLAN) {
        accessory.context.reachableLAN = true;
        this.devicesInHB.set(accessory.context.hbDeviceId, accessory);
        this.wsClient.requestUpdate(accessory).catch(() => {});
        reachableChange = true;
        this.log.warn("[%s] has been reported [online] via [LAN].", accessory.displayName);
      }
      if (reachableChange && !isX) {
        for (let i = 1; i <= accessory.context.channelCount; i++) {
          if (this.devicesInHB.has(deviceId + "SW" + i)) {
            let oAccessory = this.devicesInHB.get(deviceId + "SW" + i);
            oAccessory.context.reachableWAN = device.params.online;
            if (device.params.updateSource === "LAN") {
              oAccessory.context.reachableLAN = true;
            }
            this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory);
          }
        }
      }
      if (this.debug) {
        this.log(
          "[%s] externally updated from above %s message and will be refreshed.",
          accessory.displayName,
          device.params.updateSource
        );
      }
      if (!this.refreshAccessory(accessory, device.params)) {
        this.log.warn(
          "[%s] cannot be refreshed. Please try removing accessory from the Homebridge cache along with any secondary devices (SW1, SW2, etc.). [debug:%s:%s]",
          accessory.displayName,
          accessory.context.type,
          accessory.context.channelCount
        );
      }
    } else {
      if (!(this.config.hideDevFromHB || "").includes(deviceId)) {
        this.log.warn(
          "[%s] update received via %s does not exist in Homebridge so device will be added.",
          deviceId,
          device.params.updateSource
        );
        this.httpClient
          .getDevice(deviceId)
          .then(res => this.initialiseDevice(res))
          .catch(err => this.log.error("[%s] error getting info [%s]", deviceId, err));
      }
    }
  }
  internalValveUpdate(accessory, valve, value, callback) {
    try {
      if (!accessory.context.reachableWAN && !accessory.context.reachableLAN) {
        throw "it is currently offline";
      }
      let params = {},
        serviceValve = accessory.getService(valve);
      serviceValve
        .updateCharacteristic(Characteristic.Active, value)
        .updateCharacteristic(Characteristic.InUse, value);
      switch (value) {
        case 0:
          serviceValve.updateCharacteristic(Characteristic.RemainingDuration, 0);
          clearTimeout(accessory.getService(valve).timer);
          break;
        case 1:
          let timer = serviceValve.getCharacteristic(Characteristic.SetDuration).value;
          serviceValve.updateCharacteristic(Characteristic.RemainingDuration, timer);
          serviceValve.timer = setTimeout(
            () => serviceValve.setCharacteristic(Characteristic.Active, 0),
            timer * 1000
          );
          break;
      }
      params.switches = this.devicesInEW.get(accessory.context.eweDeviceId).params.switches;
      switch (valve) {
        case "Valve A":
          params.switches[0].switch = value ? "on" : "off";
          params.switches[1].switch = accessory
            .getService("Valve B")
            .getCharacteristic(Characteristic.Active).value
            ? "on"
            : "off";
          break;
        case "Valve B":
          params.switches[0].switch = accessory
            .getService("Valve A")
            .getCharacteristic(Characteristic.Active).value
            ? "on"
            : "off";
          params.switches[1].switch = value ? "on" : "off";
          break;
        default:
          throw "unknown valve [" + valve + "]";
      }
      params.switches[2].switch = "off";
      params.switches[3].switch = "off";
      this.sendDeviceUpdate(accessory, params, callback);
    } catch (err) {
      let str = "[" + accessory.displayName + "] could not be updated as " + err + ".";
      this.log.error(str);
      callback(str);
    }
  }
  internalBlindUpdate(accessory, value, callback) {
    try {
      if (!accessory.context.reachableWAN && !accessory.context.reachableLAN) {
        throw "it is currently offline";
      }
      let blindConfig;
      if (!(blindConfig = this.cusG.get(accessory.context.hbDeviceId))) {
        throw "group config missing";
      }
      if (blindConfig.type !== "blind" || !["oneSwitch", "twoSwitch"].includes(blindConfig.setup)) {
        throw "improper configuration";
      }
      let oldPos,
        params = {},
        wcService = accessory.getService(Service.WindowCovering);
      value = value >= 50 ? 100 : 0;
      oldPos = wcService.getCharacteristic(Characteristic.PositionState).value;
      if (value === oldPos * 100) {
        wcService
          .updateCharacteristic(Characteristic.TargetPosition, value)
          .updateCharacteristic(Characteristic.PositionState, oldPos);
        callback();
        return;
      }
      switch (blindConfig.setup) {
        case "oneSwitch":
          params.switch = "on";
          break;
        case "twoSwitch":
          params.switches = this.devicesInEW.get(accessory.context.eweDeviceId).params.switches;
          params.switches[0].switch = value === 100 ? "on" : "off";
          params.switches[1].switch = value === 0 ? "on" : "off";
          break;
      }
      this.sendDeviceUpdate(accessory, params, function () {
        return;
      });
      wcService
        .updateCharacteristic(Characteristic.TargetPosition, value)
        .updateCharacteristic(Characteristic.PositionState, value / 100);
      setTimeout(() => {
        wcService
          .updateCharacteristic(Characteristic.CurrentPosition, value)
          .updateCharacteristic(Characteristic.PositionState, 2);
        callback();
      }, parseInt(blindConfig.operationTime) * 100);
    } catch (err) {
      let str = "[" + accessory.displayName + "] could not be updated as " + err + ".";
      this.log.error(str);
      callback(str);
    }
  }
  internalGarageUpdate(accessory, value, callback) {
    try {
      if (!accessory.context.reachableWAN && !accessory.context.reachableLAN) {
        throw "it is currently offline";
      }
      let garageConfig;
      if (!(garageConfig = this.cusG.get(accessory.context.hbDeviceId))) {
        throw "group config missing";
      }
      if (
        garageConfig.type !== "garage" ||
        !["oneSwitch", "twoSwitch"].includes(garageConfig.setup)
      ) {
        throw "improper configuration";
      }
      accessory.context.inUse = true;
      accessory.context.state = value;
      let sensorDefinition = garageConfig.sensorId || false,
        sAccessory = false,
        oldPos,
        newPos = value,
        params = {},
        delay = 0,
        gdService = accessory.getService(Service.GarageDoorOpener);
      if (sensorDefinition && !(sAccessory = this.devicesInHB.get(garageConfig.sensorId + "SWX"))) {
        throw "defined DW2 sensor doesn't exist";
      }
      if (sensorDefinition && sAccessory.context.type !== "sensor") {
        throw "defined DW2 sensor isn't a sensor";
      }
      oldPos = sAccessory
        ? sAccessory
            .getService(Service.ContactSensor)
            .getCharacteristic(Characteristic.ContactSensorState).value === 0
          ? 1
          : 0
        : gdService.getCharacteristic(Characteristic.CurrentDoorState).value;
      if (newPos === oldPos % 2) {
        accessory.context.inUse = false;
        callback();
        return;
      }
      if (garageConfig.setup === "oneSwitch" && [2, 3].includes(oldPos)) {
        gdService.updateCharacteristic(Characteristic.CurrentDoorState, ((oldPos * 2) % 3) + 2);
        delay = 1500;
      }
      setTimeout(() => {
        if (accessory.context.state === newPos) {
          gdService
            .updateCharacteristic(Characteristic.TargetDoorState, newPos)
            .updateCharacteristic(Characteristic.CurrentDoorState, newPos + 2);
          switch (garageConfig.setup) {
            case "oneSwitch":
              params.switch = "on";
              break;
            case "twoSwitch":
              params.switches = this.devicesInEW.get(accessory.context.eweDeviceId).params.switches;
              params.switches[0].switch = newPos === 0 ? "on" : "off";
              params.switches[1].switch = newPos === 1 ? "on" : "off";
              break;
          }
          this.sendDeviceUpdate(accessory, params, function () {
            return;
          });
          setTimeout(() => {
            if (!sAccessory) {
              gdService.updateCharacteristic(Characteristic.CurrentDoorState, newPos);
            }
            accessory.context.inUse = false;
          }, parseInt(garageConfig.operationTime) * 100);
        }
      }, delay);
      callback();
    } catch (err) {
      accessory.context.inUse = false;
      let str = "[" + accessory.displayName + "] could not be updated as " + err + ".";
      this.log.error(str);
      callback(str);
    }
  }
  internalLockUpdate(accessory, value, callback) {
    try {
      if (!accessory.context.reachableWAN && !accessory.context.reachableLAN) {
        throw "it is currently offline";
      }
      let lockConfig,
        params = {},
        lmService = accessory.getService(Service.LockMechanism);
      if (!(lockConfig = this.cusG.get(accessory.context.hbDeviceId))) {
        throw "group config missing";
      }
      if (lockConfig.type !== "lock") {
        throw "improper configuration";
      }
      accessory.context.inUse = true;
      this.log("[%s] has received request to unlock.", accessory.displayName);
      lmService
        .updateCharacteristic(Characteristic.LockTargetState, 0)
        .updateCharacteristic(Characteristic.LockCurrentState, 0);
      params.switch = "on";
      this.sendDeviceUpdate(accessory, params, callback);
      setTimeout(() => {
        lmService
          .updateCharacteristic(Characteristic.LockTargetState, 1)
          .updateCharacteristic(Characteristic.LockCurrentState, 1);
        accessory.context.inUse = false;
      }, parseInt(lockConfig.operationTime) * 100);
    } catch (err) {
      accessory.context.inUse = false;
      let str = "[" + accessory.displayName + "] could not be updated as " + err + ".";
      this.log.error(str);
      callback(str);
    }
  }
  internalFanUpdate(accessory, type, value, callback) {
    try {
      if (!accessory.context.reachableWAN && !accessory.context.reachableLAN) {
        throw "it is currently offline";
      }
      let newPower,
        newSpeed,
        newLight,
        lightService = accessory.getService(Service.Lightbulb),
        fanService = accessory.getService(Service.Fanv2);
      switch (type) {
        case "power":
          newPower = value;
          newSpeed = value ? 33 : 0;
          newLight = lightService.getCharacteristic(Characteristic.On).value;
          break;
        case "speed":
          newPower = value >= 33 ? 1 : 0;
          newSpeed = value;
          newLight = lightService.getCharacteristic(Characteristic.On).value;
          break;
        case "light":
          newPower = fanService.getCharacteristic(Characteristic.Active).value;
          newSpeed = fanService.getCharacteristic(Characteristic.RotationSpeed).value;
          newLight = value;
          break;
      }
      lightService.updateCharacteristic(Characteristic.On, newLight);
      fanService
        .updateCharacteristic(Characteristic.Active, newPower)
        .updateCharacteristic(Characteristic.RotationSpeed, newSpeed);
      let params = {
        switches: this.devicesInEW.get(accessory.context.eweDeviceId).params.switches,
      };
      params.switches[0].switch = newLight ? "on" : "off";
      params.switches[1].switch = newPower === 1 && newSpeed >= 33 ? "on" : "off";
      params.switches[2].switch = newPower === 1 && newSpeed >= 66 && newSpeed < 99 ? "on" : "off";
      params.switches[3].switch = newPower === 1 && newSpeed >= 99 ? "on" : "off";
      if (this.debug) {
        this.log.warn("Fan Update - setting " + type + " to " + value);
        this.log(
          "[%s] new stats: power [%s], speed [%s%], light [%s].",
          accessory.displayName,
          newPower,
          newSpeed,
          newLight
        );
      }
      this.sendDeviceUpdate(accessory, params, callback);
    } catch (err) {
      let str = "[" + accessory.displayName + "] could not be updated as " + err + ".";
      this.log.error(str);
      callback(str);
    }
  }
  internalThermostatUpdate(accessory, value, callback) {
    try {
      if (!accessory.context.reachableWAN && !accessory.context.reachableLAN) {
        throw "it is currently offline";
      }
      let params = {
          switch: value ? "on" : "off",
          mainSwitch: value ? "on" : "off",
        },
        switchService = accessory.getService(Service.Switch);
      if (this.debug) {
        this.log("[%s] updating to turn [%s].", accessory.displayName, value ? "on" : "off");
      }
      switchService.updateCharacteristic(Characteristic.On, value);
      this.sendDeviceUpdate(accessory, params, callback);
    } catch (err) {
      let str = "[" + accessory.displayName + "] could not be updated as " + err + ".";
      this.log.error(str);
      callback(str);
    }
  }
  internalOutletUpdate(accessory, value, callback) {
    try {
      if (!accessory.context.reachableWAN && !accessory.context.reachableLAN) {
        throw "it is currently offline";
      }
      let params = {
          switch: value ? "on" : "off",
        },
        outletService = accessory.getService(Service.Outlet);
      if (this.debug) {
        this.log("[%s] requesting to turn [%s].", accessory.displayName, value ? "on" : "off");
      }
      outletService.updateCharacteristic(Characteristic.On, value);
      this.sendDeviceUpdate(accessory, params, callback);
    } catch (err) {
      callback("[" + accessory.displayName + "] " + err + ".");
    }
  }
  internalUSBUpdate(accessory, value, callback) {
    try {
      if (!accessory.context.reachableWAN && !accessory.context.reachableLAN) {
        throw "it is currently offline";
      }
      let params = {
          switches: this.devicesInEW.get(accessory.context.eweDeviceId).params.switches,
        },
        outletService = accessory.getService(Service.Outlet);
      params.switches[0].switch = value ? "on" : "off";
      if (this.debug) {
        this.log("[%s] requesting to turn [%s].", accessory.displayName, value ? "on" : "off");
      }
      outletService.updateCharacteristic(Characteristic.On, value);
      this.sendDeviceUpdate(accessory, params, callback);
    } catch (err) {
      callback("[" + accessory.displayName + "] " + err + ".");
    }
  }
  internalSCMUpdate(accessory, value, callback) {
    try {
      if (!accessory.context.reachableWAN && !accessory.context.reachableLAN) {
        throw "it is currently offline";
      }
      let params = {
          switches: this.devicesInEW.get(accessory.context.eweDeviceId).params.switches,
        },
        switchService = accessory.getService(Service.Switch);
      params.switches[0].switch = value ? "on" : "off";
      if (this.debug) {
        this.log("[%s] requesting to turn [%s].", accessory.displayName, value ? "on" : "off");
      }
      switchService.updateCharacteristic(Characteristic.On, value);
      this.sendDeviceUpdate(accessory, params, callback);
    } catch (err) {
      callback("[" + accessory.displayName + "] " + err + ".");
    }
  }
  internalLightbulbUpdate(accessory, value, callback) {
    try {
      if (!accessory.context.reachableWAN && !accessory.context.reachableLAN) {
        throw "it is currently offline";
      }
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
          if (this.debug) {
            this.log("[%s] updating to turn [%s].", accessory.displayName, value ? "on" : "off");
          }
          lightService.updateCharacteristic(Characteristic.On, value);
          break;
        case "0":
          params.switches = this.devicesInEW.get(accessory.context.eweDeviceId).params.switches;
          params.switches[0].switch = value ? "on" : "off";
          params.switches[1].switch = value ? "on" : "off";
          params.switches[2].switch = value ? "on" : "off";
          params.switches[3].switch = value ? "on" : "off";
          if (this.debug) {
            this.log(
              "[%s] updating to turn group [%s].",
              accessory.displayName,
              value ? "on" : "off"
            );
          }
          lightService.updateCharacteristic(Characteristic.On, value);
          for (let i = 1; i <= 4; i++) {
            if (this.devicesInHB.has(accessory.context.eweDeviceId + "SW" + i)) {
              oAccessory = this.devicesInHB.get(accessory.context.eweDeviceId + "SW" + i);
              oAccessory
                .getService(Service.Lightbulb)
                .updateCharacteristic(Characteristic.On, value);
            }
          }
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          if (this.debug) {
            this.log("[%s] updating to turn [%s].", accessory.displayName, value ? "on" : "off");
          }
          lightService.updateCharacteristic(Characteristic.On, value);
          let tAccessory,
            masterState = "off";
          params.switches = this.devicesInEW.get(accessory.context.eweDeviceId).params.switches;
          for (let i = 1; i <= 4; i++) {
            if ((tAccessory = this.devicesInHB.get(accessory.context.eweDeviceId + "SW" + i))) {
              i === parseInt(accessory.context.switchNumber)
                ? (params.switches[i - 1].switch = value ? "on" : "off")
                : (params.switches[i - 1].switch = tAccessory
                    .getService(Service.Lightbulb)
                    .getCharacteristic(Characteristic.On).value
                    ? "on"
                    : "off");
              if (
                tAccessory.getService(Service.Lightbulb).getCharacteristic(Characteristic.On).value
              ) {
                masterState = "on";
              }
            } else {
              params.switches[i - 1].switch = "off";
            }
          }
          if (!this.hiddenMasters.includes(accessory.context.eweDeviceId)) {
            oAccessory = this.devicesInHB.get(accessory.context.eweDeviceId + "SW0");
            oAccessory
              .getService(Service.Lightbulb)
              .updateCharacteristic(Characteristic.On, masterState === "on");
          }
          break;
        default:
          throw "unknown switch number [" + accessory.context.switchNumber + "]";
      }
      this.sendDeviceUpdate(accessory, params, callback);
    } catch (err) {
      let str = "[" + accessory.displayName + "] could not be updated as " + err + ".";
      this.log.error(str);
      callback(str);
    }
  }
  internalBrightnessUpdate(accessory, value, callback) {
    try {
      if (!accessory.context.reachableWAN && !accessory.context.reachableLAN) {
        throw "it is currently offline";
      }
      let params = {},
        lightService = accessory.getService(Service.Lightbulb);
      if (value === 0) {
        params.switch = "off";
        lightService.updateCharacteristic(Characteristic.On, false);
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
          default:
            throw "unknown device UIID";
        }
        lightService.updateCharacteristic(Characteristic.Brightness, value);
      }
      if (this.debug) {
        this.log("[%s] updating brightness to [%s%].", accessory.displayName, value);
      }
      setTimeout(() => this.sendDeviceUpdate(accessory, params, callback), 250);
    } catch (err) {
      let str = "[" + accessory.displayName + "] could not be updated as " + err + ".";
      this.log.error(str);
      callback(str);
    }
  }
  internalHSBUpdate(accessory, type, value, callback) {
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
            default:
              throw "unknown device UIID";
          }
          if (this.debug) {
            this.log("[%s] updating hue to [%s°].", accessory.displayName, value);
          }
          lightService.updateCharacteristic(Characteristic.Hue, value);
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
          if (this.debug) {
            this.log("[%s] updating brightness to [%s%].", accessory.displayName, value);
          }
          lightService.updateCharacteristic(Characteristic.Brightness, value);
          break;
        default:
          throw "unknown device UIID";
      }
      setTimeout(() => this.sendDeviceUpdate(accessory, params, callback), 250);
    } catch (err) {
      let str = "[" + accessory.displayName + "] could not be updated as " + err + ".";
      this.log.error(str);
      callback(str);
    }
  }
  internalSwitchUpdate(accessory, value, callback) {
    try {
      if (!accessory.context.reachableWAN && !accessory.context.reachableLAN) {
        throw "it is currently offline";
      }
      let oAccessory,
        params = {},
        switchService = accessory.getService(Service.Switch);
      switch (accessory.context.switchNumber) {
        case "X":
          params.switch = value ? "on" : "off";
          if (this.debug) {
            this.log("[%s] updating to turn [%s].", accessory.displayName, value ? "on" : "off");
          }
          switchService.updateCharacteristic(Characteristic.On, value);
          break;
        case "0":
          params.switches = this.devicesInEW.get(accessory.context.eweDeviceId).params.switches;
          params.switches[0].switch = value ? "on" : "off";
          params.switches[1].switch = value ? "on" : "off";
          params.switches[2].switch = value ? "on" : "off";
          params.switches[3].switch = value ? "on" : "off";
          if (this.debug) {
            this.log(
              "[%s] updating to turn group [%s].",
              accessory.displayName,
              value ? "on" : "off"
            );
          }
          switchService.updateCharacteristic(Characteristic.On, value);
          for (let i = 1; i <= 4; i++) {
            if (this.devicesInHB.has(accessory.context.eweDeviceId + "SW" + i)) {
              oAccessory = this.devicesInHB.get(accessory.context.eweDeviceId + "SW" + i);
              oAccessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, value);
            }
          }
          break;
        case "1":
        case "2":
        case "3":
        case "4":
          if (this.debug) {
            this.log("[%s] updating to turn [%s].", accessory.displayName, value ? "on" : "off");
          }
          switchService.updateCharacteristic(Characteristic.On, value);
          let tAccessory,
            masterState = "off";
          params.switches = this.devicesInEW.get(accessory.context.eweDeviceId).params.switches;
          for (let i = 1; i <= 4; i++) {
            if ((tAccessory = this.devicesInHB.get(accessory.context.eweDeviceId + "SW" + i))) {
              i === parseInt(accessory.context.switchNumber)
                ? (params.switches[i - 1].switch = value ? "on" : "off")
                : (params.switches[i - 1].switch = tAccessory
                    .getService(Service.Switch)
                    .getCharacteristic(Characteristic.On).value
                    ? "on"
                    : "off");
              if (
                tAccessory.getService(Service.Switch).getCharacteristic(Characteristic.On).value
              ) {
                masterState = "on";
              }
            } else {
              params.switches[i - 1].switch = "off";
            }
          }
          if (!this.hiddenMasters.includes(accessory.context.eweDeviceId)) {
            oAccessory = this.devicesInHB.get(accessory.context.eweDeviceId + "SW0");
            oAccessory
              .getService(Service.Switch)
              .updateCharacteristic(Characteristic.On, masterState === "on");
          }
          break;
        default:
          throw "unknown switch number [" + accessory.context.switchNumber + "]";
      }
      this.sendDeviceUpdate(accessory, params, callback);
    } catch (err) {
      let str = "[" + accessory.displayName + "] could not be updated as " + err + ".";
      this.log.error(str);
      callback(str);
    }
  }
  internalRFDeviceUpdate(accessory, rfChl, callback) {
    try {
      if (!accessory.context.reachableWAN && !accessory.context.reachableLAN) {
        throw "it is currently offline";
      }
      rfChl = parseInt(rfChl);
      let params = {
          cmd: "transmit",
          rfChl,
        },
        rfService = accessory.getService(accessory.context.rfChls[rfChl]);
      if (this.debug) {
        this.log(
          "[%s %s] mimicking RF button press.",
          accessory.displayName,
          accessory.context.rfChls[rfChl]
        );
      }
      rfService.updateCharacteristic(Characteristic.On, true);
      this.sendDeviceUpdate(accessory, params, callback);
      setTimeout(() => rfService.updateCharacteristic(Characteristic.On, false), 3000);
    } catch (err) {
      let str = "[" + accessory.displayName + " " + name + "] could not be updated as " + err + ".";
      this.log.error(str);
      callback(str);
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
      this.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
  externalBlindUpdate(accessory, params) {
    try {
      let blindConfig,
        nSte,
        wcService = accessory.getService(Service.WindowCovering);
      if (!(blindConfig = this.cusG.get(accessory.context.hbDeviceId))) {
        throw "group config missing";
      }
      if (blindConfig.type !== "blind" || ["oneSwitch", "twoSwitch"].includes(blindConfig.setup)) {
        throw "improper configuration";
      }
      switch (blindConfig.setup) {
        case "oneSwitch":
          if (params.switch === "off") {
            return;
          }
          nSte = wcService.getCharacteristic(Characteristic.PositionState).value === 0 ? 1 : 0;
          break;
        case "twoSwitch":
          if (params.switches[0].switch === "off" && params.switches[1].switch === "off") {
            return;
          }
          let switchUp = params.switches[0].switch === "on" ? -1 : 0, // matrix of numbers to get
            switchDown = params.switches[1].switch === "on" ? 0 : 2; // ... the correct HomeKit value
          nSte = switchUp + switchDown;
          break;
      }
      wcService
        .updateCharacteristic(Characteristic.PositionState, nSte)
        .updateCharacteristic(Characteristic.TargetPosition, nSte * 100);
      setTimeout(() => {
        wcService
          .updateCharacteristic(Characteristic.PositionState, 2)
          .updateCharacteristic(Characteristic.CurrentPosition, nSte * 100);
      }, parseInt(blindConfig.operationTime) * 100);
    } catch (err) {
      this.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
  externalGarageUpdate(accessory, params) {
    try {
      let garageConfig,
        gcService = accessory.getService(Service.GarageDoorOpener),
        oldPos = gcService.getCharacteristic(Characteristic.CurrentDoorState).value,
        newPos = [0, 2].includes(oldPos) ? 3 : 2;
      if (!(garageConfig = this.cusG.get(accessory.context.hbDeviceId))) {
        throw "group config missing";
      }
      if (
        garageConfig.type !== "garage" ||
        !["oneSwitch", "twoSwitch"].includes(garageConfig.setup)
      ) {
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
            params.switches[oldPos % 2].switch === "on"
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
        setTimeout(() => {
          gcService.updateCharacteristic(Characteristic.CurrentDoorState, newPos - 2);
        }, parseInt(garageConfig.operationTime) * 100);
      }
      setTimeout(() => {
        accessory.context.inUse = false;
      }, parseInt(garageConfig.operationTime) * 100);
    } catch (err) {
      accessory.context.inUse = false;
      this.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
  externalLockUpdate(accessory, params) {
    try {
      let lockConfig,
        lmService = accessory.getService(Service.LockMechanism);
      if (!(lockConfig = this.cusG.get(accessory.context.hbDeviceId))) {
        throw "group config missing";
      }
      if (lockConfig.type !== "lock") {
        throw "improper configuration";
      }
      if (params.switch === "off" || accessory.context.inUse) {
        return;
      }
      accessory.context.inUse = true;
      lmService
        .updateCharacteristic(Characteristic.LockCurrentState, 0)
        .updateCharacteristic(Characteristic.LockTargetState, 0);
      setTimeout(() => {
        lmService
          .updateCharacteristic(Characteristic.LockCurrentState, 1)
          .updateCharacteristic(Characteristic.LockTargetState, 1);
        accessory.context.inUse = false;
      }, parseInt(lockConfig.operationTime) * 100);
    } catch (err) {
      accessory.context.inUse = false;
      this.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
  externalSensorUpdate(accessory, params) {
    try {
      if (params.hasOwnProperty("battery")) {
        let batteryService =
            accessory.getService(Service.BatteryService) ||
            accessory.addService(Service.BatteryService),
          scaledBattery = Math.round(params.battery * 33.3);
        batteryService.updateCharacteristic(Characteristic.BatteryLevel, scaledBattery);
        batteryService.updateCharacteristic(Characteristic.StatusLowBattery, scaledBattery < 25);
      }
      let newState = params.switch === "on" ? 1 : 0,
        oAccessory = false,
        contactService = accessory.getService(Service.ContactSensor);
      contactService.updateCharacteristic(Characteristic.ContactSensorState, newState);
      this.cusG.forEach(group => {
        if (group.sensorId === accessory.context.eweDeviceId && group.type === "garage") {
          if ((oAccessory = this.devicesInHB.get(group.deviceId + "SWX"))) {
            switch (newState) {
              case 0:
                oAccessory
                  .getService(Service.GarageDoorOpener)
                  .updateCharacteristic(Characteristic.TargetDoorState, 1)
                  .updateCharacteristic(Characteristic.CurrentDoorState, 1);
                break;
              case 1:
                setTimeout(() => {
                  oAccessory
                    .getService(Service.GarageDoorOpener)
                    .updateCharacteristic(Characteristic.TargetDoorState, 0)
                    .updateCharacteristic(Characteristic.CurrentDoorState, 0);
                }, group.operationTime * 100);
                break;
              default:
                throw "unknown sensor status received [" + newState + "]";
            }
          }
        }
      });
    } catch (err) {
      this.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
  externalFanUpdate(accessory, params) {
    try {
      let light,
        status,
        speed,
        lightService = accessory.getService(Service.Lightbulb),
        fanService = accessory.getService(Service.Fanv2);
      if (Array.isArray(params.switches)) {
        light = params.switches[0].switch === "on";
        switch (params.switches[1].switch + params.switches[2].switch + params.switches[3].switch) {
          default:
            status = 0;
            speed = 0;
            break;
          case "onoffoff":
            status = 1;
            speed = 33;
            break;
          case "ononoff":
            status = 1;
            speed = 66;
            break;
          case "onoffon":
            status = 1;
            speed = 99;
        }
      } else if (
        params.hasOwnProperty("light") &&
        params.hasOwnProperty("fan") &&
        params.hasOwnProperty("speed")
      ) {
        light = params.light === "on";
        status = params.fan === "on" ? 1 : 0;
        speed = params.speed * 33 * status;
      } else {
        throw "unknown parameters received";
      }
      lightService.updateCharacteristic(Characteristic.On, light);
      fanService
        .updateCharacteristic(Characteristic.Active, status)
        .updateCharacteristic(Characteristic.RotationSpeed, speed);
    } catch (err) {
      this.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
  externalThermostatUpdate(accessory, params) {
    try {
      if (
        !this.config.hideTHSwitch &&
        (params.hasOwnProperty("switch") || params.hasOwnProperty("mainSwitch"))
      ) {
        let newState = params.hasOwnProperty("switch")
            ? params.switch === "on"
            : params.mainSwitch === "on",
          switchService = accessory.getService(Service.Switch);
        switchService.updateCharacteristic(Characteristic.On, newState);
      }
      let eveLog = {
        time: Date.now(),
      };
      if (
        params.hasOwnProperty("currentTemperature") &&
        accessory.getService(Service.TemperatureSensor)
      ) {
        let currentTemp =
          params.currentTemperature !== "unavailable" ? params.currentTemperature : 0;
        accessory
          .getService(Service.TemperatureSensor)
          .updateCharacteristic(Characteristic.CurrentTemperature, currentTemp);
        eveLog.temp = parseFloat(currentTemp);
      }
      if (
        params.hasOwnProperty("currentHumidity") &&
        accessory.getService(Service.HumiditySensor)
      ) {
        let currentHumi = params.currentHumidity !== "unavailable" ? params.currentHumidity : 0;
        accessory
          .getService(Service.HumiditySensor)
          .updateCharacteristic(Characteristic.CurrentRelativeHumidity, currentHumi);
        eveLog.humidity = parseFloat(currentHumi);
      }
      if (eveLog.hasOwnProperty("temp") || eveLog.hasOwnProperty("humidity")) {
        accessory.eveLogger.addEntry(eveLog);
      }
    } catch (err) {
      this.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
  externalOutletUpdate(accessory, params) {
    try {
      let outletService = accessory.getService(Service.Outlet);
      if (params.hasOwnProperty("switch")) {
        outletService.updateCharacteristic(Characteristic.On, params.switch === "on");
      }
      if (params.hasOwnProperty("power")) {
        outletService.updateCharacteristic(
          EveService.Characteristics.CurrentConsumption,
          parseFloat(params.power)
        );
        outletService.updateCharacteristic(
          Characteristic.OutletInUse,
          parseFloat(params.power) > 0
        );
        let isOn = accessory.getService(Service.Outlet).getCharacteristic(Characteristic.On).value;
        accessory.eveLogger.addEntry({
          time: Date.now(),
          power: isOn ? parseFloat(params.power) : 0,
        });
      }
      if (params.hasOwnProperty("voltage")) {
        outletService.updateCharacteristic(
          EveService.Characteristics.Voltage,
          parseFloat(params.voltage)
        );
      }
      if (params.hasOwnProperty("current")) {
        outletService.updateCharacteristic(
          EveService.Characteristics.ElectricCurrent,
          parseFloat(params.current)
        );
      }
    } catch (err) {
      this.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
  externalUSBUpdate(accessory, params) {
    try {
      accessory
        .getService(Service.Outlet)
        .updateCharacteristic(Characteristic.On, params.switches[0].switch === "on");
    } catch (err) {
      this.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
  externalSCMUpdate(accessory, params) {
    try {
      accessory
        .getService(Service.Switch)
        .updateCharacteristic(Characteristic.On, params.switches[0].switch === "on");
    } catch (err) {
      this.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
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
            } else if (
              params.hasOwnProperty("channel0") &&
              parseInt(params.channel0) + parseInt(params.channel1) > 0
            ) {
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
      this.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
  externalMultiLightUpdate(accessory, params) {
    try {
      let idToCheck = accessory.context.hbDeviceId.slice(0, -1),
        primaryState = false;
      for (let i = 1; i <= accessory.context.channelCount; i++) {
        if (this.devicesInHB.has(idToCheck + i)) {
          let oAccessory = this.devicesInHB.get(idToCheck + i);
          oAccessory
            .getService(Service.Lightbulb)
            .updateCharacteristic(Characteristic.On, params.switches[i - 1].switch === "on");
          if (params.switches[i - 1].switch === "on") {
            primaryState = true;
          }
        }
      }
      if (!this.hiddenMasters.includes(accessory.context.eweDeviceId)) {
        accessory
          .getService(Service.Lightbulb)
          .updateCharacteristic(Characteristic.On, primaryState);
      }
    } catch (err) {
      this.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
  externalSingleSwitchUpdate(accessory, params) {
    try {
      accessory
        .getService(Service.Switch)
        .updateCharacteristic(Characteristic.On, params.switch === "on");
    } catch (err) {
      this.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
  externalMultiSwitchUpdate(accessory, params) {
    try {
      let idToCheck = accessory.context.hbDeviceId.slice(0, -1),
        primaryState = false;
      for (let i = 1; i <= accessory.context.channelCount; i++) {
        if (this.devicesInHB.has(idToCheck + i)) {
          let oAccessory = this.devicesInHB.get(idToCheck + i);
          oAccessory
            .getService(Service.Switch)
            .updateCharacteristic(Characteristic.On, params.switches[i - 1].switch === "on");
          if (params.switches[i - 1].switch === "on") {
            primaryState = true;
          }
        }
      }
      if (!this.hiddenMasters.includes(accessory.context.eweDeviceId)) {
        accessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, primaryState);
      }
    } catch (err) {
      this.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
  externalRFDeviceUpdate(accessory, params) {
    try {
      if (!params.hasOwnProperty("updateSource")) return;
      let idToCheck = accessory.context.hbDeviceId.slice(0, -1),
        timeNow = new Date();
      if (
        params.hasOwnProperty("cmd") &&
        params.cmd === "transmit" &&
        params.hasOwnProperty("rfChl")
      ) {
        // RF Button
        let bAccessory;
        if (
          (bAccessory = this.devicesInHB.get(idToCheck + accessory.context.rfChlMap[params.rfChl]))
        ) {
          bAccessory
            .getService(bAccessory.context.rfChls[params.rfChl])
            .updateCharacteristic(Characteristic.On, 1);
          setTimeout(
            () =>
              bAccessory
                .getService(bAccessory.context.rfChls[params.rfChl])
                .updateCharacteristic(Characteristic.On, 0),
            3000
          );
        } else {
          throw "rf button not found in Homebridge";
        }
      } else if (params.hasOwnProperty("cmd") && params.cmd === "trigger") {
        // RF Sensor
        Object.keys(params)
          .filter(name => /rfTrig/.test(name))
          .forEach(chan => {
            let chanNum = chan.substr(-1).toString(),
              accessoryNum = accessory.context.rfChlMap[chanNum],
              oAccessory;
            if ((oAccessory = this.devicesInHB.get(idToCheck + accessoryNum))) {
              let timeOfMotion = new Date(params[chan]),
                diff = (timeNow.getTime() - timeOfMotion.getTime()) / 1000;
              if (diff < (this.config.sensorTimeDifference || 120)) {
                switch (oAccessory.context.sensorType) {
                  case "button":
                    break;
                  case "water":
                    oAccessory
                      .getService(Service.LeakSensor)
                      .updateCharacteristic(Characteristic.LeakDetected, 1);
                    setTimeout(() => {
                      oAccessory
                        .getService(Service.LeakSensor)
                        .updateCharacteristic(Characteristic.LeakDetected, 0);
                    }, (this.config.sensorTimeLength || 2) * 1000);
                    break;
                  case "fire":
                  case "smoke":
                    oAccessory
                      .getService(Service.SmokeSensor)
                      .updateCharacteristic(Characteristic.SmokeDetected, 1);
                    setTimeout(() => {
                      oAccessory
                        .getService(Service.SmokeSensor)
                        .updateCharacteristic(Characteristic.SmokeDetected, 0);
                    }, (this.config.sensorTimeLength || 2) * 1000);
                    break;
                  case "co":
                    oAccessory
                      .getService(Service.CarbonMonoxideSensor)
                      .updateCharacteristic(Characteristic.CarbonMonoxideDetected, 1);
                    setTimeout(() => {
                      oAccessory
                        .getService(Service.CarbonMonoxideSensor)
                        .updateCharacteristic(Characteristic.CarbonMonoxideDetected, 0);
                    }, (this.config.sensorTimeLength || 2) * 1000);
                    break;
                  case "co2":
                    oAccessory
                      .getService(Service.CarbonDioxideSensor)
                      .updateCharacteristic(Characteristic.CarbonDioxideDetected, 1);
                    setTimeout(() => {
                      oAccessory
                        .getService(Service.CarbonDioxideSensor)
                        .updateCharacteristic(Characteristic.CarbonDioxideDetected, 0);
                    }, (this.config.sensorTimeLength || 2) * 1000);
                    break;
                  case "contact":
                    oAccessory
                      .getService(Service.ContactSensor)
                      .updateCharacteristic(Characteristic.ContactSensorState, 1);
                    setTimeout(() => {
                      oAccessory
                        .getService(Service.ContactSensor)
                        .updateCharacteristic(Characteristic.ContactSensorState, 0);
                    }, (this.config.sensorTimeLength || 2) * 1000);
                    break;
                  case "occupancy":
                    oAccessory
                      .getService(Service.OccupancySensor)
                      .updateCharacteristic(Characteristic.OccupancyDetected, 1);
                    setTimeout(() => {
                      oAccessory
                        .getService(Service.OccupancySensor)
                        .updateCharacteristic(Characteristic.OccupancyDetected, 0);
                    }, (this.config.sensorTimeLength || 2) * 1000);
                    break;
                  default:
                    oAccessory
                      .getService(Service.MotionSensor)
                      .updateCharacteristic(Characteristic.MotionDetected, true);
                    setTimeout(() => {
                      oAccessory
                        .getService(Service.MotionSensor)
                        .updateCharacteristic(Characteristic.MotionDetected, false);
                    }, (this.config.sensorTimeLength || 2) * 1000);
                    break;
                }
                if (this.debug) {
                  this.log(
                    "[%s] has detected [%s].",
                    oAccessory.displayName,
                    oAccessory.context.sensorType
                  );
                }
              }
            }
          });
      }
    } catch (err) {
      this.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
  externalZBDeviceUpdate(accessory, params) {
    try {
      //*** credit @tasict ***\\
      if (params.hasOwnProperty("battery")) {
        if (accessory.context.eweUIID === 3026 && (this.config.ZBDWBatt || false)) {
          params.battery *= 10;
        }
        let batteryService =
          accessory.getService(Service.BatteryService) ||
          accessory.addService(Service.BatteryService);
        batteryService.updateCharacteristic(Characteristic.BatteryLevel, params.battery);
        batteryService.updateCharacteristic(Characteristic.StatusLowBattery, params.battery < 25);
      }
      switch (accessory.context.eweUIID) {
        case 1000:
          if (params.hasOwnProperty("key") && [0, 1, 2].includes(params.key)) {
            accessory
              .getService(Service.StatelessProgrammableSwitch)
              .updateCharacteristic(Characteristic.ProgrammableSwitchEvent, params.key);
          }
          break;
        case 1770:
          let eveLog = {
            time: Date.now(),
          };
          if (params.hasOwnProperty("temperature")) {
            let currentTemp = parseInt(params.temperature) / 100;
            accessory
              .getService(Service.TemperatureSensor)
              .updateCharacteristic(Characteristic.CurrentTemperature, currentTemp);
            eveLog.temp = parseFloat(currentTemp);
          }
          if (params.hasOwnProperty("humidity")) {
            let currentHumi = parseInt(params.humidity) / 100;
            accessory
              .getService(Service.HumiditySensor)
              .updateCharacteristic(Characteristic.CurrentRelativeHumidity, currentHumi);
            eveLog.humidity = parseFloat(currentHumi);
          }
          if (eveLog.hasOwnProperty("temp") || eveLog.hasOwnProperty("humidity")) {
            accessory.eveLogger.addEntry(eveLog);
          }
          break;
        case 2026:
          if (params.hasOwnProperty("motion") && params.hasOwnProperty("trigTime")) {
            let timeNow = new Date(),
              diff = (timeNow.getTime() - params.trigTime) / 1000;
            accessory
              .getService(Service.MotionSensor)
              .updateCharacteristic(
                Characteristic.MotionDetected,
                params.hasOwnProperty("updateSource") &&
                  params.motion === 1 &&
                  diff < (this.config.sensortimeDifference || 120)
              );
            break;
          }
          break;
        case 3026:
          if (params.hasOwnProperty("lock") && [0, 1].includes(params.lock)) {
            accessory
              .getService(Service.ContactSensor)
              .updateCharacteristic(Characteristic.ContactSensorState, params.lock);
          }
          break;
      }
    } catch (err) {
      this.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
}
module.exports = function (homebridge) {
  Accessory = homebridge.platformAccessory;
  Characteristic = homebridge.hap.Characteristic;
  EveService = new hbLib.EveHomeKitTypes(homebridge);
  EveHistoryService = fakegato(homebridge);
  Service = homebridge.hap.Service;
  UUIDGen = homebridge.hap.uuid;
  return eWeLink;
};
