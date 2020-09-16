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
      log.error("**************** Cannot load homebridge-ewelink ****************");
      log.error("Your eWeLink credentials are missing from the Homebridge config.");
      log.error("****************************************************************");
      return;
    }
    this.log = log;
    this.config = config;
    this.api = api;
    this.debug = this.config.debug || false;
    this.devicesInHB = new Map();
    this.devicesInEwe = new Map();
    this.cusG = new Map();
    this.cusS = new Map();
    this.eveLogPath = this.api.user.storagePath() + "/homebridge-ewelink/";
    this.api
      .on("didFinishLaunching", () => {
        this.log(
          "Plugin has finished initialising. Starting synchronisation with eWeLink account."
        );
        //*** Set up HTTP client and get the user HTTP host ***\\
        this.httpClient = new eWeLinkHTTP(this.config, this.log);
        this.httpClient
          .getHost()
          .then(() => this.httpClient.login())
          .then(res => {
            //*** Set up the web socket client ***\\
            this.wsClient = new eWeLinkWS(this.config, this.log, res);
            return this.wsClient.getHost();
          })
          .then(() => {
            //*** Open web socket connection and get device list via HTTP ***\\
            this.wsClient.login();
            return this.httpClient.getDevices();
          })
          .then(res => {
            //*** Get device IP addresses for LAN mode ***\\
            this.httpDevices = res
              .filter(
                device => device.hasOwnProperty("extra") && device.extra.hasOwnProperty("uiid")
              )
              .filter(device => !(this.config.hideDevFromHB || "").includes(device.deviceid));
            this.lanClient = new eWeLinkLAN(this.config, this.log, this.httpDevices);
            this.httpDevices.forEach(device => this.devicesInEwe.set(device.deviceid, device));
            return this.lanClient.getHosts();
          })
          .then(res => {
            //*** Set up the LAN mode listener ***\\
            this.lanDevices = res.map;
            this.lanDevicesOnline = res.count;
            return this.lanClient.startMonitor();
          })
          .then(() => {
            //*** Use the device list to refresh Homebridge accessories ***\\
            (() => {
              //*** Remove all Homebridge accessories if none found ***\\
              if (
                Object.keys(this.httpDevices).length === 0 &&
                Object.keys(this.lanDevices).length === 0
              ) {
                Array.from(this.devicesInHB.values()).forEach(a => this.removeAccessory(a));
                this.devicesInHB.clear();
                this.log.warn("******* Not loading homebridge-ewelink *******");
                this.log.warn("No devices were found in your eWeLink account.");
                this.log.warn("**********************************************");
                return;
              }
              //*** Make a map of custom groups from Homebridge config ***\\
              if (Object.keys(this.config.groups || []).length > 0) {
                this.config.groups
                  .filter(g => g.hasOwnProperty("type") && cns.allowedGroups.includes(g.type))
                  .filter(
                    g =>
                      g.hasOwnProperty("deviceId") &&
                      this.devicesInEwe.has(g.deviceId.toLowerCase())
                  )
                  .forEach(g => this.cusG.set(g.deviceId + "SWX", g));
              }
              //*** Make a map of RF Bridge custom sensors from Homebridge config ***\\
              if (Object.keys(this.config.bridgeSensors || []).length > 0) {
                this.config.bridgeSensors
                  .filter(
                    s =>
                      s.hasOwnProperty("deviceId") &&
                      this.devicesInEwe.has(s.deviceId.toLowerCase())
                  )
                  .forEach(s => this.cusS.set(s.fullDeviceId, s));
              }
              //*** Logging always helps to see if everything is okay so far ***\\
              this.log(
                "[%s] eWeLink devices were loaded from the Homebridge cache.",
                this.devicesInHB.size
              );
              this.log(
                "[%s] primary devices were loaded from your eWeLink account.",
                this.devicesInEwe.size
              );
              this.log(
                "[%s] primary devices were discovered on your local network.",
                this.lanDevicesOnline
              );
              //*** Remove Homebridge accessories that don't appear in eWeLink ***\\
              this.devicesInHB.forEach(a => {
                if (!this.devicesInEwe.has(a.context.eweDeviceId)) {
                  this.removeAccessory(a);
                }
              });
              //*** Synchronise devices between eWeLink and Homebridge and set up ws/lan listeners ***\\
              this.devicesInEwe.forEach(d => this.initialiseDevice(d));
              this.wsClient.receiveUpdate(d => this.receiveDeviceUpdate(d));
              this.lanClient.receiveUpdate(d => this.receiveDeviceUpdate(d));
              this.log(
                "eWeLink setup complete. If you're enjoying this package please consider a ⭐️  on GitHub :)."
              );
              if (this.config.debugReqRes || false) {
                this.log.warn(
                  "You have 'Request & Response Logging' enabled. This setting is not recommended for long-term use."
                );
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
      })
      .on("shutdown", () => {
        if (this.lanClient) this.lanClient.closeConnection();
        if (this.wsClient) this.wsClient.closeConnection();
      });
  }
  initialiseDevice(device) {
    let accessory;
    //*** First add the device if it isn't already in Homebridge. Yeah this code looks a mess :| ***\\
    if (
      !this.devicesInHB.has(device.deviceid + "SWX") &&
      !this.devicesInHB.has(device.deviceid + "SW0")
    ) {
      if (
        device.extra.uiid === 2 &&
        device.brandName === "coolkit" &&
        device.productModel === "0285"
      ) {
        this.addAccessory(device, device.deviceid + "SWX", "valve");
      } else if (
        this.cusG.has(device.deviceid + "SWX") &&
        this.cusG.get(device.deviceid + "SWX").type === "blind"
      ) {
        this.addAccessory(device, device.deviceid + "SWX", "blind");
      } else if (
        this.cusG.has(device.deviceid + "SWX") &&
        this.cusG.get(device.deviceid + "SWX").type === "garage"
      ) {
        this.addAccessory(device, device.deviceid + "SWX", "garage");
      } else if (
        this.cusG.has(device.deviceid + "SWX") &&
        this.cusG.get(device.deviceid + "SWX").type === "lock"
      ) {
        this.addAccessory(device, device.deviceid + "SWX", "lock");
      } else if (cns.devicesSensor.includes(device.extra.uiid)) {
        this.addAccessory(device, device.deviceid + "SWX", "sensor");
      } else if (cns.devicesFan.includes(device.extra.uiid)) {
        this.addAccessory(device, device.deviceid + "SWX", "fan");
      } else if (cns.devicesThermostat.includes(device.extra.uiid)) {
        this.addAccessory(device, device.deviceid + "SWX", "thermostat");
      } else if (cns.devicesOutlet.includes(device.extra.uiid)) {
        this.addAccessory(device, device.deviceid + "SWX", "outlet");
      } else if (cns.devicesUSB.includes(device.extra.uiid)) {
        this.addAccessory(device, device.deviceid + "SWX", "usb");
      } else if (cns.devicesSCM.includes(device.extra.uiid)) {
        this.addAccessory(device, device.deviceid + "SWX", "scm");
      } else if (
        cns.devicesSingleSwitch.includes(device.extra.uiid) &&
        cns.devicesSingleSwitchLight.includes(device.productModel)
      ) {
        this.addAccessory(device, device.deviceid + "SWX", "light");
      } else if (
        cns.devicesMultiSwitch.includes(device.extra.uiid) &&
        cns.devicesMultiSwitchLight.includes(device.productModel)
      ) {
        for (let i = 0; i <= cns.chansFromUiid[device.extra.uiid]; i++) {
          this.addAccessory(device, device.deviceid + "SW" + i, "light");
        }
      } else if (cns.devicesSingleSwitch.includes(device.extra.uiid)) {
        this.addAccessory(device, device.deviceid + "SWX", "switch");
      } else if (cns.devicesMultiSwitch.includes(device.extra.uiid)) {
        for (let i = 0; i <= cns.chansFromUiid[device.extra.uiid]; i++) {
          this.addAccessory(device, device.deviceid + "SW" + i, "switch");
        }
      } else if (cns.devicesRFBridge.includes(device.extra.uiid)) {
        this.addAccessory(device, device.deviceid + "SW0", "rf_pri");
        if (Object.keys((device.tags && device.tags.zyx_info) || []).length > 0) {
          for (let i = 1; i <= Object.keys(device.tags.zyx_info).length; i++) {
            this.addAccessory(device, device.deviceid + "SW" + i, "rf_sub");
          }
        }
      } else if (cns.devicesZBBridge.includes(device.extra.uiid)) {
        this.addAccessory(device, device.deviceid + "SWX", "zb_pri");
      } else if (cns.devicesZB.includes(device.extra.uiid)) {
        this.addAccessory(device, device.deviceid + "SWX", "zb_sub");
      } else if (cns.devicesCamera.includes(device.extra.uiid)) {
        this.log.warn(
          '[%s] please see "https://github.com/bwp91/homebridge-ewelink/wiki/How-to-set-up-Sonoff-Camera".',
          device.name
        );
        return;
      } else {
        this.log.warn(
          "[%s] cannot be added as it is not supported by this plugin. Please make a GitHub issue request.",
          device.name
        );
        return;
      }
    }
    //*** Next refresh the device ***\\
    if (
      (accessory =
        this.devicesInHB.get(device.deviceid + "SWX") ||
        this.devicesInHB.get(device.deviceid + "SW0"))
    ) {
      let isX = accessory.context.hbDeviceId.substr(-1) === "X",
        isRfBridge = cns.devicesRFBridge.includes(accessory.context.eweUIID),
        rfBridgeChange = false;
      accessory
        .getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.FirmwareRevision, device.params.fwVersion);
      accessory.context.reachableWAN = accessory.context.eweUIID !== 102 ? device.online : true;
      accessory.context.reachableLAN = this.lanDevices.get(device.deviceid).online || false;
      accessory.context.inUse = false;
      let str = accessory.context.reachableLAN
        ? "and locally with IP [" + this.lanDevices.get(device.deviceid).ip + "]"
        : "but LAN mode unavailable as unsupported/shared device";
      this.log("[%s] found in eWeLink %s.", accessory.displayName, str);
      this.devicesInHB.set(accessory.context.hbDeviceId, accessory);
      if (!isX) {
        for (let i = 1; i <= accessory.context.channelCount; i++) {
          if (!this.devicesInHB.has(device.deviceid + "SW" + i)) {
            if (cns.devicesHideable.includes(accessory.context.type)) {
              if ((this.config.hideFromHB || "").includes(device.deviceid + "SW" + i)) {
                continue;
              } else {
                this.addAccessory(device, device.deviceid + "SW" + i, "switch");
              }
            }
          }
          let oAccessory = this.devicesInHB.get(device.deviceid + "SW" + i);
          if (
            (this.config.hideFromHB || "").includes(device.deviceid + "SW" + i) &&
            cns.devicesHideable.includes(accessory.context.type)
          ) {
            this.removeAccessory(oAccessory);
            continue;
          }
          if (isRfBridge && oAccessory.context.sensorType !== "button") {
            let ct = this.cusS.has(oAccessory.context.hbDeviceId)
              ? this.cusS.get(oAccessory.context.hbDeviceId).type
              : "motion";
            if (ct !== oAccessory.context.sensorType) rfBridgeChange = true;
          }
          oAccessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.FirmwareRevision, device.params.fwVersion);
          oAccessory.context.reachableWAN = device.online;
          oAccessory.context.reachableLAN = this.lanDevices.get(device.deviceid).online || false;
          this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory);
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
      if (!this.refreshAccessory(accessory, device.params)) {
        this.log.warn(
          "[%s] could not be initialised. Please try removing accessory from the Homebridge cache along with any secondary devices (SW1, SW2, etc.) [debug:%s:%s].",
          accessory.displayName,
          accessory.context.type,
          accessory.context.channelCount
        );
      }
    } else {
      this.log.warn("[%s] cannot be initialised as it wasn't found in Homebridge.", device.name);
    }
  }
  addAccessory(device, hbDeviceId, type) {
    let switchNumber = hbDeviceId.substr(-1).toString(),
      newDeviceName = type === "rf_sub" ? device.tags.zyx_info[switchNumber - 1].name : device.name,
      channelCount =
        type === "rf_pri"
          ? Object.keys((device.tags && device.tags.zyx_info) || []).length
          : cns.chansFromUiid[device.extra.uiid];
    if (["1", "2", "3", "4"].includes(switchNumber) && type !== "rf_sub") {
      newDeviceName += " SW" + switchNumber;
      if (
        (this.config.hideFromHB || "").includes(hbDeviceId) &&
        cns.devicesHideable.includes(type)
      ) {
        this.log("[%s] will not be added as per configuration.", newDeviceName);
        return;
      }
    }
    if ((this.config.nameOverride || {}).hasOwnProperty(hbDeviceId)) {
      newDeviceName = this.config.nameOverride[hbDeviceId];
    }
    const accessory = new Accessory(newDeviceName, UUIDGen.generate(hbDeviceId).toString());
    try {
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
      switch (type) {
        case "valve":
          ["A", "B"].forEach(v => {
            accessory
              .addService(Service.Valve, "Valve " + v, "valve" + v.toLowerCase())
              .setCharacteristic(Characteristic.Active, 0)
              .setCharacteristic(Characteristic.InUse, 0)
              .setCharacteristic(Characteristic.ValveType, 1)
              .setCharacteristic(Characteristic.SetDuration, this.config.valveTimeLength || 120)
              .addCharacteristic(Characteristic.RemainingDuration);
          });
          break;
        case "blind":
          accessory
            .addService(Service.WindowCovering)
            .setCharacteristic(Characteristic.CurrentPosition, 100)
            .setCharacteristic(Characteristic.TargetPosition, 100)
            .setCharacteristic(Characteristic.PositionState, 2);
          break;
        case "garage":
          accessory
            .addService(Service.GarageDoorOpener)
            .setCharacteristic(Characteristic.CurrentDoorState, 1)
            .setCharacteristic(Characteristic.TargetDoorState, 1)
            .setCharacteristic(Characteristic.ObstructionDetected, false);
          break;
        case "lock":
          accessory
            .addService(Service.LockMechanism)
            .setCharacteristic(Characteristic.LockCurrentState, 1)
            .setCharacteristic(Characteristic.LockTargetState, 1);
          break;
        case "sensor":
          accessory.addService(Service.ContactSensor);
          accessory.addService(Service.BatteryService);
          break;
        case "fan":
          accessory.addService(Service.Fanv2);
          accessory.addService(Service.Lightbulb);
          break;
        case "thermostat":
          if (!this.config.hideTHSwitch) accessory.addService(Service.Switch);
          accessory.addService(Service.TemperatureSensor);
          if (device.params.sensorType !== "DS18B20") accessory.addService(Service.HumiditySensor);
          break;
        case "outlet":
          accessory.addService(Service.Outlet);
          accessory
            .getService(Service.Outlet)
            .addCharacteristic(EveService.Characteristics.Voltage);
          accessory
            .getService(Service.Outlet)
            .addCharacteristic(EveService.Characteristics.CurrentConsumption);
          accessory
            .getService(Service.Outlet)
            .addCharacteristic(EveService.Characteristics.ElectricCurrent);
          accessory
            .getService(Service.Outlet)
            .addCharacteristic(EveService.Characteristics.TotalConsumption);
          accessory
            .getService(Service.Outlet)
            .addCharacteristic(EveService.Characteristics.ResetTotal);
          accessory.context = {
            ...accessory.context,
            ...{
              extraPersistedData: {},
              lastReset: 0,
              totalEnergy: 0,
              totalEnergyTemp: 0,
            },
          };
          break;
        case "usb":
          accessory.addService(Service.Outlet);
          break;
        case "light":
          accessory.addService(Service.Lightbulb);
          break;
        case "switch":
        case "scm":
          accessory.addService(Service.Switch);
          break;
        case "rf_pri":
          accessory.context.rfChlMap = {};
          break;
        case "zb_pri":
          break;
        case "rf_sub":
          accessory.context.rfChls = {};
          switch (device.tags.zyx_info[parseInt(switchNumber) - 1].remote_type) {
            case "1":
            case "2":
            case "3":
            case "4":
              accessory.context.sensorType = "button";
              break;
            case "6":
              accessory.context.sensorType = this.cusS.has(hbDeviceId)
                ? this.cusS.get(hbDeviceId).type
                : "motion";
              break;
            default:
              throw (
                "unsupported rf device type [" +
                device.tags.zyx_info[parseInt(switchNumber) - 1].remote_type +
                "]. Please create an issue on GitHub"
              );
          }
          let mAccessory = this.devicesInHB.get(device.deviceid + "SW0");
          device.tags.zyx_info[parseInt(switchNumber) - 1].buttonName.forEach(button => {
            let rfData;
            Object.entries(button).forEach(
              ([k, v]) =>
                (rfData = {
                  rfChan: k,
                  name: v,
                })
            );
            accessory.context.rfChls[rfData.rfChan] = rfData.name;
            mAccessory.context.rfChlMap[rfData.rfChan] = switchNumber;
            switch (accessory.context.sensorType) {
              case "button":
                accessory.addService(Service.Switch, rfData.name, "switch" + rfData.rfChan);
                break;
              case "water":
                accessory.addService(Service.LeakSensor);
                break;
              case "fire":
              case "smoke":
                accessory.addService(Service.SmokeSensor);
                break;
              case "co":
                accessory.addService(Service.CarbonMonoxideSensor);
                break;
              case "co2":
                accessory.addService(Service.CarbonDioxideSensor);
                break;
              case "contact":
                accessory.addService(Service.ContactSensor);
                break;
              case "occupancy":
                accessory.addService(Service.OccupancySensor);
                break;
              default:
                accessory.addService(Service.MotionSensor);
                break;
            }
            this.devicesInHB.set(mAccessory.context.hbDeviceId, mAccessory);
          });
          break;
        case "zb_sub": //*** credit @tasict ***\\
          accessory.addService(Service.BatteryService);
          switch (device.extra.uiid) {
            case 1000:
              accessory.addService(Service.StatelessProgrammableSwitch);
              if (this.config.hideZBLDPress) {
                accessory
                  .getService(Service.StatelessProgrammableSwitch)
                  .getCharacteristic(Characteristic.ProgrammableSwitchEvent)
                  .setProps({
                    validValues: [0],
                  });
              }
              break;
            case 1770:
              accessory.addService(Service.TemperatureSensor);
              accessory.addService(Service.HumiditySensor);
              break;
            case 2026:
              accessory.addService(Service.MotionSensor);
              break;
            case 3026:
              accessory.addService(Service.ContactSensor);
              break;
            default:
              throw (
                "unsupported zigbee device type [" +
                device.extra.uiid +
                "]. Please create an issue on GitHub"
              );
          }
          break;
        default:
          throw "device is not supported by this plugin. Please create an issue on GitHub";
      }
      this.devicesInHB.set(hbDeviceId, accessory);
      this.api.registerPlatformAccessories("homebridge-ewelink", "eWeLink", [accessory]);
      this.configureAccessory(accessory);
      this.log("[%s] has been added to Homebridge.", newDeviceName);
    } catch (err) {
      this.log.warn("[%s] could not be added as %s.", newDeviceName, err);
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
            accessory
              .getService("Valve " + v)
              .getCharacteristic(Characteristic.Active)
              .on("set", (value, callback) =>
                this.internalValveUpdate(accessory, "Valve " + v, value, callback)
              );
            accessory
              .getService("Valve " + v)
              .getCharacteristic(Characteristic.SetDuration)
              .on("set", (value, callback) => {
                if (
                  accessory.getService("Valve " + v).getCharacteristic(Characteristic.InUse).value
                ) {
                  accessory
                    .getService("Valve " + v)
                    .updateCharacteristic(Characteristic.RemainingDuration, value);
                  clearTimeout(accessory.getService("Valve " + v).timer);
                  accessory.getService("Valve " + v).timer = setTimeout(() => {
                    accessory.getService("Valve " + v).setCharacteristic(Characteristic.Active, 0);
                  }, value * 1000);
                }
                callback();
              });
          });
          break;
        case "blind":
          accessory
            .getService(Service.WindowCovering)
            .getCharacteristic(Characteristic.TargetPosition)
            .on("set", (value, callback) => this.internalBlindUpdate(accessory, value, callback))
            .setProps({
              minStep: 100,
            });
          break;
        case "garage":
          accessory
            .getService(Service.GarageDoorOpener)
            .getCharacteristic(Characteristic.TargetDoorState)
            .on("set", (value, callback) => this.internalGarageUpdate(accessory, value, callback));
          break;
        case "lock":
          accessory
            .getService(Service.LockMechanism)
            .getCharacteristic(Characteristic.LockTargetState)
            .on("set", (value, callback) => this.internalLockUpdate(accessory, value, callback));
          break;
        case "fan":
          accessory
            .getService(Service.Fanv2)
            .getCharacteristic(Characteristic.Active)
            .on("set", (value, callback) =>
              this.internalFanUpdate(accessory, "power", value, callback)
            );
          accessory
            .getService(Service.Fanv2)
            .getCharacteristic(Characteristic.RotationSpeed)
            .on("set", (value, callback) =>
              this.internalFanUpdate(accessory, "speed", value, callback)
            )
            .setProps({
              minStep: 33,
            });
          accessory
            .getService(Service.Lightbulb)
            .getCharacteristic(Characteristic.On)
            .on("set", (value, callback) =>
              this.internalFanUpdate(accessory, "light", value, callback)
            );
          break;
        case "thermostat":
          if (!this.config.hideTHSwitch) {
            accessory
              .getService(Service.Switch)
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
              temp: accessory
                .getService(Service.TemperatureSensor)
                .getCharacteristic(Characteristic.CurrentTemperature).value,
            };
            if (accessory.getService(Service.HumiditySensor)) {
              dataToAdd.humidity = accessory
                .getService(Service.HumiditySensor)
                .getCharacteristic(Characteristic.CurrentRelativeHumidity).value;
            }
            accessory.eveLogger.addEntry(dataToAdd);
          }, 300000);
          break;
        case "outlet":
          accessory
            .getService(Service.Outlet)
            .getCharacteristic(Characteristic.On)
            .on("set", (value, callback) => this.internalOutletUpdate(accessory, value, callback));
          accessory.log = this.log;
          accessory.eveLogger = new EveHistoryService("energy", accessory, {
            storage: "fs",
            minutes: 5,
            path: this.eveLogPath,
          });
          if (!accessory.context.hasOwnProperty("lastReset")) {
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
          corrInterval.setCorrectingInterval(() => {
            let isOn = accessory.getService(Service.Outlet).getCharacteristic(Characteristic.On)
                .value,
              currentWatt = isOn
                ? accessory
                    .getService(Service.Outlet)
                    .getCharacteristic(EveService.Characteristics.CurrentConsumption).value
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
          accessory
            .getService(Service.Outlet)
            .getCharacteristic(EveService.Characteristics.TotalConsumption)
            .on("get", callback => {
              accessory.context.extraPersistedData = accessory.eveLogger.getExtraPersistedData();
              if (accessory.context.extraPersistedData !== undefined) {
                accessory.context.totalEnergy = accessory.context.extraPersistedData.totalPower;
              }
              callback(null, accessory.context.totalEnergy);
            });
          accessory
            .getService(Service.Outlet)
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
          accessory
            .getService(Service.Outlet)
            .getCharacteristic(Characteristic.On)
            .on("set", (value, callback) => this.internalUSBUpdate(accessory, value, callback));
          break;
        case "scm":
          accessory
            .getService(Service.Switch)
            .getCharacteristic(Characteristic.On)
            .on("set", (value, callback) => this.internalSCMUpdate(accessory, value, callback));
          break;
        case "light":
          accessory
            .getService(Service.Lightbulb)
            .getCharacteristic(Characteristic.On)
            .on("set", (value, callback) =>
              this.internalLightbulbUpdate(accessory, value, callback)
            );
          if (cns.devicesBrightable.includes(accessory.context.eweUIID)) {
            accessory
              .getService(Service.Lightbulb)
              .getCharacteristic(Characteristic.Brightness)
              .on("set", (value, callback) => {
                if (value > 0) {
                  if (
                    !accessory.getService(Service.Lightbulb).getCharacteristic(Characteristic.On)
                      .value
                  ) {
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
            accessory
              .getService(Service.Lightbulb)
              .getCharacteristic(Characteristic.Brightness)
              .on("set", (value, callback) => {
                if (value > 0) {
                  if (
                    !accessory.getService(Service.Lightbulb).getCharacteristic(Characteristic.On)
                      .value
                  ) {
                    this.internalLightbulbUpdate(accessory, true, function () {
                      return;
                    });
                  }
                  this.internalHSBUpdate(accessory, "bri", value, callback);
                } else {
                  this.internalLightbulbUpdate(accessory, false, callback);
                }
              });
            accessory
              .getService(Service.Lightbulb)
              .getCharacteristic(Characteristic.Hue)
              .on("set", (value, callback) =>
                this.internalHSBUpdate(accessory, "hue", value, callback)
              );
            accessory
              .getService(Service.Lightbulb)
              .getCharacteristic(Characteristic.Saturation)
              .on("set", (value, callback) => callback());
          }
          break;
        case "switch":
          accessory
            .getService(Service.Switch)
            .getCharacteristic(Characteristic.On)
            .on("set", (value, callback) => this.internalSwitchUpdate(accessory, value, callback));
          break;
        case "rf_sub":
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
        case "zb_sub":
          if (accessory.context.eweUIID === 1770) {
            accessory.log = this.log;
            accessory.eveLogger = new EveHistoryService("weather", accessory, {
              storage: "fs",
              minutes: 5,
              path: this.eveLogPath,
            });
            corrInterval.setCorrectingInterval(() => {
              let dataToAdd = {
                time: Date.now(),
                temp: accessory
                  .getService(Service.TemperatureSensor)
                  .getCharacteristic(Characteristic.CurrentTemperature).value,
                humidity: accessory
                  .getService(Service.HumiditySensor)
                  .getCharacteristic(Characteristic.CurrentRelativeHumidity).value,
              };
              accessory.eveLogger.addEntry(dataToAdd);
            }, 300000);
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
      this.devicesInHB.delete(accessory.context.hbDeviceId);
      this.api.unregisterPlatformAccessories("homebridge-ewelink", "eWeLink", [accessory]);
      this.log("[%s] has been removed from Homebridge.", accessory.displayName);
    } catch (err) {
      this.log.warn("[%s] needed to be removed but couldn't as %s.", accessory.displayName, err);
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
        this.wsClient.sendUpdate(payload);
        callback();
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
    let accessory;
    switch (device.action) {
      case "sysmsg":
        if (
          (accessory =
            this.devicesInHB.get(device.deviceid + "SWX") ||
            this.devicesInHB.get(device.deviceid + "SW0"))
        ) {
          let isX = accessory.context.hbDeviceId.substr(-1) === "X";
          if (device.params.updateSource === "WS") {
            if (accessory.context.reachableWAN !== device.params.online) {
              accessory.context.reachableWAN = device.params.online;
              this.log(
                "[%s] has been reported [%s] via [WS].",
                accessory.displayName,
                accessory.context.reachableWAN ? "online" : "offline"
              );
              this.devicesInHB.set(accessory.context.hbDeviceId, accessory);
              if (accessory.context.reachableWAN) this.wsClient.requestUpdate(accessory);
            } else {
              if (this.debug) {
                this.log("[%s] Nothing to update from above WS message.", accessory.displayName);
              }
            }
          }
          if (!isX) {
            for (let i = 1; i <= accessory.context.channelCount; i++) {
              if (this.devicesInHB.has(device.deviceid + "SW" + i)) {
                let oAccessory = this.devicesInHB.get(device.deviceid + "SW" + i);
                oAccessory.context.reachableWAN = device.params.online;
                this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory);
              }
            }
          }
        }
        break;
      case "update":
        if (
          (accessory =
            this.devicesInHB.get(device.deviceid + "SWX") ||
            this.devicesInHB.get(device.deviceid + "SW0"))
        ) {
          if (device.params.updateSource === "WS" && !accessory.context.reachableWAN) {
            accessory.context.reachableWAN = true;
            this.log("[%s] has been reported [online] via [WS].", accessory.displayName);
          }
          if (device.params.updateSource === "LAN" && !accessory.context.reachableLAN) {
            accessory.context.reachableLAN = true;
            this.log("[%s] has been reported [online] via [LAN].", accessory.displayName);
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
          if (!(this.config.hideDevFromHB || "").includes(device.deviceid)) {
            this.log.warn(
              "[%s] Accessory received via %s update does not exist in Homebridge. If it's a new accessory please restart Homebridge so it is added.",
              device.deviceid,
              device.params.updateSource
            );
          }
        }
        break;
    }
  }
  internalValveUpdate(accessory, valve, value, callback) {
    try {
      if (!accessory.context.reachableWAN && !accessory.context.reachableLAN) {
        throw "it is currently offline";
      }
      let params = {};
      accessory
        .getService(valve)
        .updateCharacteristic(Characteristic.Active, value)
        .updateCharacteristic(Characteristic.InUse, value);
      switch (value) {
        case 0:
          accessory.getService(valve).updateCharacteristic(Characteristic.RemainingDuration, 0);
          clearTimeout(accessory.getService(valve).timer);
          break;
        case 1:
          let timer = accessory.getService(valve).getCharacteristic(Characteristic.SetDuration)
            .value;
          accessory.getService(valve).updateCharacteristic(Characteristic.RemainingDuration, timer);
          accessory.getService(valve).timer = setTimeout(() => {
            accessory.getService(valve).setCharacteristic(Characteristic.Active, 0);
          }, timer * 1000);
          break;
      }
      params.switches = this.devicesInEwe.get(accessory.context.eweDeviceId).params.switches;
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
        params = {};
      value = value >= 50 ? 100 : 0;
      oldPos = accessory
        .getService(Service.WindowCovering)
        .getCharacteristic(Characteristic.PositionState).value;
      if (value === oldPos * 100) {
        accessory
          .getService(Service.WindowCovering)
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
          params.switches = this.devicesInEwe.get(accessory.context.eweDeviceId).params.switches;
          params.switches[0].switch = value === 100 ? "on" : "off";
          params.switches[1].switch = value === 0 ? "on" : "off";
          break;
      }
      this.sendDeviceUpdate(accessory, params, function () {
        return;
      });
      accessory
        .getService(Service.WindowCovering)
        .updateCharacteristic(Characteristic.TargetPosition, value)
        .updateCharacteristic(Characteristic.PositionState, value / 100);
      setTimeout(() => {
        accessory
          .getService(Service.WindowCovering)
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
        delay = 0;
      if (sensorDefinition && !(sAccessory = this.devicesInHB.get(garageConfig.sensorId + "SWX"))) {
        throw "defined DW2 sensor doesn't exist";
      }
      if (sAccessory.context.type !== "sensor") {
        throw "defined DW2 sensor isn't a sensor";
      }
      oldPos = sAccessory
        ? sAccessory
            .getService(Service.ContactSensor)
            .getCharacteristic(Characteristic.ContactSensorState).value === 0
          ? 1
          : 0
        : accessory
            .getService(Service.GarageDoorOpener)
            .getCharacteristic(Characteristic.CurrentDoorState).value;
      if (newPos === oldPos % 2) {
        accessory.context.inUse = false;
        callback();
        return;
      }
      if (garageConfig.setup === "oneSwitch" && [2, 3].includes(oldPos)) {
        accessory
          .getService(Service.GarageDoorOpener)
          .updateCharacteristic(Characteristic.CurrentDoorState, ((oldPos * 2) % 3) + 2);
        delay = 1500;
      }
      setTimeout(() => {
        if (accessory.context.state === newPos) {
          accessory
            .getService(Service.GarageDoorOpener)
            .updateCharacteristic(Characteristic.TargetDoorState, newPos)
            .updateCharacteristic(Characteristic.CurrentDoorState, newPos + 2);
          switch (garageConfig.setup) {
            case "oneSwitch":
              params.switch = "on";
              break;
            case "twoSwitch":
              params.switches = this.devicesInEwe.get(
                accessory.context.eweDeviceId
              ).params.switches;
              params.switches[0].switch = newPos === 0 ? "on" : "off";
              params.switches[1].switch = newPos === 1 ? "on" : "off";
              break;
          }
          this.sendDeviceUpdate(accessory, params, function () {
            return;
          });
          setTimeout(() => {
            if (!sAccessory) {
              accessory
                .getService(Service.GarageDoorOpener)
                .updateCharacteristic(Characteristic.CurrentDoorState, newPos);
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
        params = {};
      if (!(lockConfig = this.cusG.get(accessory.context.hbDeviceId))) {
        throw "group config missing";
      }
      if (lockConfig.type !== "lock") {
        throw "improper configuration";
      }
      accessory.context.inUse = true;
      this.log("[%s] has received request to unlock.", accessory.displayName);
      accessory
        .getService(Service.LockMechanism)
        .updateCharacteristic(Characteristic.LockTargetState, 0)
        .updateCharacteristic(Characteristic.LockCurrentState, 0);
      params.switch = "on";
      this.sendDeviceUpdate(accessory, params, callback);
      setTimeout(() => {
        accessory
          .getService(Service.LockMechanism)
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
      let newPower, newSpeed, newLight;
      switch (type) {
        case "power":
          newPower = value;
          newSpeed = value ? 33 : 0;
          newLight = accessory.getService(Service.Lightbulb).getCharacteristic(Characteristic.On)
            .value;
          break;
        case "speed":
          newPower = value >= 33 ? 1 : 0;
          newSpeed = value;
          newLight = accessory.getService(Service.Lightbulb).getCharacteristic(Characteristic.On)
            .value;
          break;
        case "light":
          newPower = accessory.getService(Service.Fanv2).getCharacteristic(Characteristic.Active)
            .value;
          newSpeed = accessory
            .getService(Service.Fanv2)
            .getCharacteristic(Characteristic.RotationSpeed).value;
          newLight = value;
          break;
      }
      accessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.On, newLight);
      accessory
        .getService(Service.Fanv2)
        .updateCharacteristic(Characteristic.Active, newPower)
        .updateCharacteristic(Characteristic.RotationSpeed, newSpeed);
      let params = {
        switches: this.devicesInEwe.get(accessory.context.eweDeviceId).params.switches,
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
      };
      if (this.debug) {
        this.log("[%s] updating to turn [%s].", accessory.displayName, value ? "on" : "off");
      }
      accessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, value);
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
      };
      if (this.debug) {
        this.log("[%s] requesting to turn [%s].", accessory.displayName, value ? "on" : "off");
      }
      accessory.getService(Service.Outlet).updateCharacteristic(Characteristic.On, value);
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
        switches: this.devicesInEwe.get(accessory.context.eweDeviceId).params.switches,
      };
      params.switches[0].switch = value ? "on" : "off";
      if (this.debug) {
        this.log("[%s] requesting to turn [%s].", accessory.displayName, value ? "on" : "off");
      }
      accessory.getService(Service.Outlet).updateCharacteristic(Characteristic.On, value);
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
        switches: this.devicesInEwe.get(accessory.context.eweDeviceId).params.switches,
      };
      params.switches[0].switch = value ? "on" : "off";
      if (this.debug) {
        this.log("[%s] requesting to turn [%s].", accessory.displayName, value ? "on" : "off");
      }
      accessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, value);
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
        params = {};
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
          accessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.On, value);
          break;
        case "0":
          params.switches = this.devicesInEwe.get(accessory.context.eweDeviceId).params.switches;
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
          accessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.On, value);
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
          accessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.On, value);
          let tAccessory,
            masterState = "off";
          params.switches = this.devicesInEwe.get(accessory.context.eweDeviceId).params.switches;
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
          oAccessory = this.devicesInHB.get(accessory.context.eweDeviceId + "SW0");
          oAccessory
            .getService(Service.Lightbulb)
            .updateCharacteristic(Characteristic.On, masterState === "on");
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
      let params = {};
      if (value === 0) {
        params.switch = "off";
        accessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.On, false);
      } else {
        if (!accessory.getService(Service.Lightbulb).getCharacteristic(Characteristic.On).value) {
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
        accessory
          .getService(Service.Lightbulb)
          .updateCharacteristic(Characteristic.Brightness, value);
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
        curHue = accessory.getService(Service.Lightbulb).getCharacteristic(Characteristic.Hue)
          .value,
        curSat = accessory
          .getService(Service.Lightbulb)
          .getCharacteristic(Characteristic.Saturation).value;
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
          accessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.Hue, value);
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
          accessory
            .getService(Service.Lightbulb)
            .updateCharacteristic(Characteristic.Brightness, value);
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
        params = {};
      switch (accessory.context.switchNumber) {
        case "X":
          params.switch = value ? "on" : "off";
          if (this.debug) {
            this.log("[%s] updating to turn [%s].", accessory.displayName, value ? "on" : "off");
          }
          accessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, value);
          break;
        case "0":
          params.switches = this.devicesInEwe.get(accessory.context.eweDeviceId).params.switches;
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
          accessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, value);
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
          accessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, value);
          let tAccessory,
            masterState = "off";
          params.switches = this.devicesInEwe.get(accessory.context.eweDeviceId).params.switches;
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
          oAccessory = this.devicesInHB.get(accessory.context.eweDeviceId + "SW0");
          oAccessory
            .getService(Service.Switch)
            .updateCharacteristic(Characteristic.On, masterState === "on");
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
      };
      if (this.debug) {
        this.log(
          "[%s %s] mimicking RF button press.",
          accessory.displayName,
          accessory.context.rfChls[rfChl]
        );
      }
      accessory
        .getService(accessory.context.rfChls[rfChl])
        .updateCharacteristic(Characteristic.On, true);
      this.sendDeviceUpdate(accessory, params, callback);
      setTimeout(
        () =>
          accessory
            .getService(accessory.context.rfChls[rfChl])
            .updateCharacteristic(Characteristic.On, false),
        3000
      );
    } catch (err) {
      let str = "[" + accessory.displayName + " " + name + "] could not be updated as " + err + ".";
      this.log.error(str);
      callback(str);
    }
  }
  externalValveUpdate(accessory, params) {
    try {
      ["A", "B"].forEach((v, k) => {
        accessory
          .getService("Valve " + v)
          .updateCharacteristic(Characteristic.Active, params.switches[k].switch === "on")
          .updateCharacteristic(Characteristic.InUse, params.switches[k].switch === "on");
        if (params.switches[k].switch === "on") {
          let timer = accessory
            .getService("Valve " + v)
            .getCharacteristic(Characteristic.SetDuration).value;
          accessory
            .getService("Valve " + v)
            .updateCharacteristic(Characteristic.RemainingDuration, timer);
          accessory.getService("Valve " + v).timer = setTimeout(() => {
            accessory.getService("Valve " + v).setCharacteristic(Characteristic.Active, 0);
          }, timer * 1000);
        } else {
          accessory
            .getService("Valve " + v)
            .updateCharacteristic(Characteristic.RemainingDuration, 0);
          clearTimeout(accessory.getService("Valve " + v).timer);
        }
      });
    } catch (err) {
      this.log.warn("[%s] could not be updated as %s.", accessory.displayName, err);
    }
  }
  externalBlindUpdate(accessory, params) {
    try {
      let blindConfig, nSte;
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
          nSte =
            accessory
              .getService(Service.WindowCovering)
              .getCharacteristic(Characteristic.PositionState).value === 0
              ? 1
              : 0;
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
      accessory
        .getService(Service.WindowCovering)
        .updateCharacteristic(Characteristic.PositionState, nSte)
        .updateCharacteristic(Characteristic.TargetPosition, nSte * 100);
      setTimeout(() => {
        accessory
          .getService(Service.WindowCovering)
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
        oldPos = accessory
          .getService(Service.GarageDoorOpener)
          .getCharacteristic(Characteristic.CurrentDoorState).value,
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
        accessory
          .getService(Service.GarageDoorOpener)
          .updateCharacteristic(Characteristic.CurrentDoorState, newPos)
          .updateCharacteristic(Characteristic.TargetDoorState, newPos - 2);
        setTimeout(() => {
          accessory
            .getService(Service.GarageDoorOpener)
            .updateCharacteristic(Characteristic.CurrentDoorState, newPos - 2);
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
      let lockConfig;
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
      accessory
        .getService(Service.LockMechanism)
        .updateCharacteristic(Characteristic.LockCurrentState, 0)
        .updateCharacteristic(Characteristic.LockTargetState, 0);
      setTimeout(() => {
        accessory
          .getService(Service.LockMechanism)
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
        oAccessory = false;
      accessory
        .getService(Service.ContactSensor)
        .updateCharacteristic(Characteristic.ContactSensorState, newState);
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
      let light, status, speed;
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
      accessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.On, light);
      accessory
        .getService(Service.Fanv2)
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
          : params.mainSwitch === "on";
        accessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, newState);
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
      if (params.hasOwnProperty("switch")) {
        accessory
          .getService(Service.Outlet)
          .updateCharacteristic(Characteristic.On, params.switch === "on");
      }
      if (params.hasOwnProperty("power")) {
        accessory
          .getService(Service.Outlet)
          .updateCharacteristic(
            EveService.Characteristics.CurrentConsumption,
            parseFloat(params.power)
          );
        accessory
          .getService(Service.Outlet)
          .updateCharacteristic(Characteristic.OutletInUse, parseFloat(params.power) > 0);
        let isOn = accessory.getService(Service.Outlet).getCharacteristic(Characteristic.On).value;
        accessory.eveLogger.addEntry({
          time: Date.now(),
          power: isOn ? parseFloat(params.power) : 0,
        });
      }
      if (params.hasOwnProperty("voltage")) {
        accessory
          .getService(Service.Outlet)
          .updateCharacteristic(EveService.Characteristics.Voltage, parseFloat(params.voltage));
      }
      if (params.hasOwnProperty("current")) {
        accessory
          .getService(Service.Outlet)
          .updateCharacteristic(
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
        isOn = false;
      if (accessory.context.eweUIID === 22 && params.hasOwnProperty("state")) {
        isOn = params.state === "on";
      } else if (accessory.context.eweUIID !== 22 && params.hasOwnProperty("switch")) {
        isOn = params.switch === "on";
      } else {
        isOn = accessory.getService(Service.Lightbulb).getCharacteristic(Characteristic.On).value;
      }
      if (isOn) {
        accessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.On, true);
        switch (accessory.context.eweUIID) {
          case 36: // KING-M4
            if (params.hasOwnProperty("bright")) {
              let nb = Math.round(((params.bright - 10) * 10) / 9); // eWeLink scale is 10-100 and HomeKit scale is 0-100.
              accessory
                .getService(Service.Lightbulb)
                .updateCharacteristic(Characteristic.Brightness, nb);
            }
            break;
          case 44: // D1
            if (params.hasOwnProperty("brightness")) {
              accessory
                .getService(Service.Lightbulb)
                .updateCharacteristic(Characteristic.Brightness, params.brightness);
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
              accessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.On, true);
              newColour = convert.rgb.hsv(
                parseInt(params.channel2),
                parseInt(params.channel3),
                parseInt(params.channel4)
              );
              accessory
                .getService(Service.Lightbulb)
                .updateCharacteristic(Characteristic.Hue, newColour[0])
                .updateCharacteristic(Characteristic.Saturation, 100)
                .updateCharacteristic(Characteristic.Brightness, 100);
            } else if (mode === 1) {
              throw "has been set to white mode which is not supported";
            }
            break;
          case 59: // L1
            if (params.hasOwnProperty("bright")) {
              accessory
                .getService(Service.Lightbulb)
                .updateCharacteristic(Characteristic.Brightness, params.bright);
            }
            if (params.hasOwnProperty("colorR")) {
              newColour = convert.rgb.hsv(params.colorR, params.colorG, params.colorB);
              accessory
                .getService(Service.Lightbulb)
                .updateCharacteristic(Characteristic.Hue, newColour[0])
                .updateCharacteristic(Characteristic.Saturation, newColour[1]);
            }
            break;
          default:
            return;
        }
      } else {
        accessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.On, false);
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
      accessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.On, primaryState);
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
      accessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, primaryState);
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
