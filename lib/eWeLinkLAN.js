/* jshint esversion: 9, -W030, node: true */
"use strict";
const axios = require("axios");
const constants = require("./constants");
const crypto = require("crypto");
const dns = require("node-dns-sd");
const eventemitter = require("events");
module.exports = class eWeLinkLAN {
   constructor(config, log, devices) {
      this.config = config;
      this.log = log;
      this.devices = devices;
      let deviceMap = new Map();
      devices.forEach(device => {
         deviceMap.set(device.deviceid, {
            apiKey: device.devicekey,
            online: false,
            ip: null
         });
      });
      this.deviceMap = deviceMap;
      this.debug = this.config.debug || false;
      this.debugReqRes = this.config.debugReqRes || false;
      this.emitter = new eventemitter();
   }
   getHosts() {
      return new Promise((resolve, reject) => {
         dns.discover({
            name: "_ewelink._tcp.local"
         }).then(res => {
            let onlineCount = 0;
            res.forEach(device => {
               let d, deviceId = device.fqdn.replace("._ewelink._tcp.local", "").replace("eWeLink_", "");
               if ((d = this.deviceMap.get(deviceId))) {
                  this.deviceMap.set(deviceId, {
                     apiKey: d.apiKey,
                     online: true,
                     ip: device.address
                  });
                  onlineCount++;
               }
            });
            resolve({
               map: this.deviceMap,
               count: onlineCount
            });
         }).catch(err => {
            reject(err);
         });
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
                     data = rdata.data1 +
                     (rdata.hasOwnProperty("data2") ? rdata.data2 : "") +
                     (rdata.hasOwnProperty("data3") ? rdata.data3 : "") +
                     (rdata.hasOwnProperty("data4") ? rdata.data4 : ""),
                     key = crypto.createHash("md5").update(Buffer.from(deviceInfo.apiKey, "utf8")).digest(),
                     dText = crypto.createDecipheriv("aes-128-cbc", key, Buffer.from(rdata.iv, "base64")),
                     pText = Buffer.concat([dText.update(Buffer.from(data, "base64")), dText.final()]).toString("utf8"),
                     params;
                  if (packet.address !== deviceInfo.ip) {
                     this.deviceMap.set(rdata.id, {
                        apiKey: deviceInfo.apiKey,
                        online: true,
                        ip: packet.address
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
                        if (!constants.paramsToKeep.includes(param.replace(/[0-9]/g, ""))) {
                           delete params[param];
                        }
                     }
                  }
                  params.updateSource = "lan";
                  if (Object.keys(params).length > 0) {
                     let returnTemplate = {
                        deviceid: rdata.id,
                        action: "update",
                        params
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
      return new Promise((resolve, reject) => {
         dns.startMonitoring().then(() => {
            resolve();
         }).catch(err => {
            reject(err);
         });
      });
   }
   sendUpdate(json) {
      return new Promise((resolve, reject) => {
         if (!this.deviceMap.get(json.deviceid).online) {
            throw "device does not support LAN mode";
         }
         let apiKey, suffix, params = {};
         if (json.params.hasOwnProperty("switches")) {
            params.switches = json.params.switches;
            suffix = "switches";
         } else if (json.params.hasOwnProperty("switch")) {
            params.switch = json.params.switch;
            suffix = "switch";
         } else {
            throw "plugin does not support lan mode for this device yet - feel free to create a github issue";
         }
         if ((apiKey = this.deviceMap.get(json.deviceid).apiKey)) {
            let key = crypto.createHash('md5').update(Buffer.from(apiKey, 'utf8')).digest(),
               iv = crypto.randomBytes(16),
               enc = crypto.createCipheriv('aes-128-cbc', key, iv),
               data = {
                  data: Buffer.concat([enc.update(JSON.stringify(params)), enc.final()]).toString('base64'),
                  deviceid: json.deviceid,
                  encrypt: true,
                  iv: iv.toString('base64'),
                  selfApikey: "123",
                  sequence: Date.now().toString()
               };
            if (this.debugReqRes) {
               let msg = JSON.stringify(json, null, 2).replace(json.apikey, "**hidden**").replace(json.apikey, "**hidden**").replace(json.deviceid, "**hidden**");
               this.log.warn("LAN message sent. This text is yellow for clarity.\n%s", msg);
            } else if (this.debug) {
               this.log("LAN message sent.");
            }
            axios({
               method: "post",
               url: "http://" + this.deviceMap.get(json.deviceid).ip + ":8081/zeroconf/" + suffix,
               headers: {
                  Accept: "application/json",
                  "Content-Type": "application/json"
               },
               data
            }).then(res => {
               if (res.data.hasOwnProperty("error") && res.data.error === 0) {
                  resolve();
               }
               throw res.data;
            }).catch(err => {
               reject(err);
            });
         }
      });
   }
   receiveUpdate(f) {
      this.emitter.addListener("update", f);
   }
   closeConnection() {
      dns.stopMonitoring();
      this.log("LAN monitoring gracefully stopped.");
   }
};