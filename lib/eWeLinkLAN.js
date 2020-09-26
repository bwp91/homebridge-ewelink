/* jshint esversion: 9, -W014, -W030, node: true */
"use strict";
const axios = require("axios"),
  cns = require("./constants"),
  crypto = require("crypto"),
  dns = require("node-dns-sd"),
  eventemitter = require("events");
module.exports = class eWeLinkLAN {
  constructor(config, log, devices) {
    this.log = log;
    this.devices = devices;
    this.ipOverrides = config.ipOverride || {};
    this.deviceMap = new Map();
    devices.forEach(device => {
      this.deviceMap.set(device.deviceid, {
        apiKey: device.devicekey,
        online: this.ipOverrides.hasOwnProperty(device.deviceid) ? true : false,
        ip: this.ipOverrides.hasOwnProperty(device.deviceid) ? this.ipOverrides[device.deviceid] : null,
      });
    });
    this.debug = config.debug || false;
    this.debugReqRes = config.debugReqRes || false;
    this.emitter = new eventemitter();
  }
  getHosts() {
    return new Promise(async (resolve, reject) => {
      try {
        let res = await dns.discover({
          name: "_ewelink._tcp.local",
        });
        res.forEach(device => {
          let d,
            deviceId = device.fqdn.replace("._ewelink._tcp.local", "").replace("eWeLink_", "");
          if ((d = this.deviceMap.get(deviceId))) {
            if (!this.ipOverrides.hasOwnProperty(deviceId)) {
              this.deviceMap.set(deviceId, {
                apiKey: d.apiKey,
                online: true,
                ip: device.address,
              });
            }
          }
        });
        resolve(this.deviceMap);
      } catch (err) {
        reject(err);
      }
    });
  }
  startMonitor() {
    dns.ondata = packet => {
      if (packet.answers) {
        packet.answers
          .filter(value => value.name.includes("_ewelink._tcp.local"))
          .filter(value => value.type === "TXT")
          .filter(value => this.deviceMap.has(value.rdata.id))
          .forEach(value => {
            let rdata = value.rdata,
              deviceInfo = this.deviceMap.get(rdata.id),
              data =
                rdata.data1 +
                (rdata.hasOwnProperty("data2") ? rdata.data2 : "") +
                (rdata.hasOwnProperty("data3") ? rdata.data3 : "") +
                (rdata.hasOwnProperty("data4") ? rdata.data4 : ""),
              key = crypto.createHash("md5").update(Buffer.from(deviceInfo.apiKey, "utf8")).digest(),
              dText = crypto.createDecipheriv("aes-128-cbc", key, Buffer.from(rdata.iv, "base64")),
              pText = Buffer.concat([dText.update(Buffer.from(data, "base64")), dText.final()]).toString("utf8"),
              params;
            if (packet.address !== deviceInfo.ip && !this.ipOverrides.hasOwnProperty(rdata.id)) {
              this.deviceMap.set(rdata.id, {
                apiKey: deviceInfo.apiKey,
                online: true,
                ip: packet.address,
              });
              if (this.debug) {
                this.log.warn("[%s] updating IP address to [%s].", rdata.id, packet.address);
              }
            }
            try {
              params = JSON.parse(pText);
            } catch (e) {
              this.log.warn("[%s] An error occured reading the LAN message [%s]", rdata.id, e);
              return;
            }
            for (let param in params) {
              if (params.hasOwnProperty(param)) {
                if (!cns.paramsToKeep.includes(param.replace(/[0-9]/g, ""))) {
                  delete params[param];
                }
              }
            }
            if (Object.keys(params).length > 0) {
              params.updateSource = "LAN";
              params.online = true;
              let returnTemplate = {
                deviceid: rdata.id,
                params,
              };
              if (this.debugReqRes) {
                let msg = JSON.stringify(returnTemplate, null, 2).replace(rdata.id, "**hidden**");
                this.log("LAN message received.\n%s", msg);
              } else if (this.debug) {
                this.log("LAN message received.");
              }
              this.emitter.emit("update", returnTemplate);
            }
          });
      }
    };
    dns.startMonitoring();
  }
  sendUpdate(json) {
    return new Promise(async (resolve, reject) => {
      try {
        if (!this.deviceMap.get(json.deviceid).online) {
          throw "device isn't reachable via LAN mode";
        }
        let apiKey,
          suffix,
          params = {};
        if (json.params.hasOwnProperty("switches")) {
          params.switches = json.params.switches;
          suffix = "switches";
        } else if (json.params.hasOwnProperty("switch")) {
          params.switch = json.params.switch;
          suffix = "switch";
        } else {
          throw "device isn't reachable via LAN mode";
        }
        if ((apiKey = this.deviceMap.get(json.deviceid).apiKey)) {
          let key = crypto.createHash("md5").update(Buffer.from(apiKey, "utf8")).digest(),
            iv = crypto.randomBytes(16),
            enc = crypto.createCipheriv("aes-128-cbc", key, iv),
            data = {
              data: Buffer.concat([enc.update(JSON.stringify(params)), enc.final()]).toString("base64"),
              deviceid: json.deviceid,
              encrypt: true,
              iv: iv.toString("base64"),
              selfApikey: "123",
              sequence: Date.now().toString(),
            };
          if (this.debugReqRes) {
            let msg = JSON.stringify(json, null, 2)
              .replace(json.apikey, "**hidden**")
              .replace(json.apikey, "**hidden**")
              .replace(json.deviceid, "**hidden**");
            this.log.warn("LAN message sent. This text is yellow for clarity.\n%s", msg);
          } else if (this.debug) {
            this.log("LAN message sent.");
          }
          let res = await axios({
            method: "post",
            url: "http://" + this.deviceMap.get(json.deviceid).ip + ":8081/zeroconf/" + suffix,
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
            },
            data,
          });
          if (res.data.hasOwnProperty("error") && res.data.error === 0) {
            resolve();
          } else {
            throw res.data;
          }
        }
      } catch (err) {
        reject(err);
      }
    });
  }
  receiveUpdate(f) {
    this.emitter.addListener("update", f);
  }
  addDeviceToMap(device) {
    this.deviceMap.set(device.deviceid, {
      apiKey: device.devicekey,
      online: this.ipOverrides.hasOwnProperty(device.deviceid) ? true : false,
      ip: this.ipOverrides.hasOwnProperty(device.deviceid) ? this.ipOverrides[device.deviceid] : null,
    });
  }
  closeConnection() {
    dns.stopMonitoring();
    this.log("LAN monitoring gracefully stopped.");
  }
};
