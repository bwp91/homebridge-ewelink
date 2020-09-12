/* jshint esversion: 9, -W030, node: true */
"use strict";
const axios = require("axios"),
   constants = require("./constants"),
   eventemitter = require("events"),
   ws = require("ws");
module.exports = class eWeLinkWS {
   constructor(config, log, res) {
      this.config = config;
      this.log = log;
      this.debug = this.config.debug || false;
      this.debugReqRes = this.config.debugReqRes || false;
      this.httpHost = res.httpHost;
      this.aToken = res.aToken;
      this.apiKey = res.apiKey;
      this.wsIsOpen = false;
      this.emitter = new eventemitter();
      this.delaySend = 0;
   }
   getHost() {
      return new Promise((resolve, reject) => {
         axios({
            method: "post",
            url: "https://" + this.httpHost.replace("-api", "-disp") + "/dispatch/app",
            headers: {
               Authorization: "Bearer " + this.aToken,
               "Content-Type": "application/json"
            },
            data: {
               appid: constants.appId,
               nonce: Math.random().toString(36).substr(2, 8),
               ts: Math.floor(new Date().getTime() / 1000),
               version: 8
            }
         }).then(res => {
            let body = res.data;
            if (!body.domain) {
               throw "Server did not respond with a web socket host.";
            }
            if (this.debug) {
               this.log("Web socket host received [%s].", body.domain);
            }
            this.wsHost = body.domain;
            resolve(body.domain);
         }).catch(err => {
            reject(err);
         });
      });
   }
   login() {
      this.ws = new ws("wss://" + this.wsHost + ":8080/api/ws");
      this.ws.on("open", () => {
         this.wsIsOpen = true;
         let payload = {
            action: "userOnline",
            apikey: this.apiKey,
            appid: constants.appId,
            at: this.aToken,
            nonce: Math.random().toString(36).substr(2, 8),
            sequence: Math.floor(new Date()),
            ts: Math.floor(new Date() / 1000),
            userAgent: "app",
            version: 8
         };
         this.ws.send(JSON.stringify(payload));
         if (this.debugReqRes) {
            let msg = JSON.stringify(payload, null, 2).replace(this.aToken, "**hidden**").replace(this.apiKey, "**hidden**");
            this.log.warn("Sending WS login request. This text is yellow for clarity.\n%s", msg);
         } else if (this.debug) {
            this.log("Sending WS login request.");
         }
      });
      this.ws.on("message", m => {
         if (m === "pong") {
            return;
         }
         let device;
         try {
            device = JSON.parse(m);
         } catch (e) {
            this.log.warn("An error occured reading the web socket message [%s]", e);
            return;
         }
         // for requestUpdate response
         if (device.hasOwnProperty("deviceid") && device.hasOwnProperty("params") && device.hasOwnProperty("error") && device.error === 0) {
            device.action = "update";
         } else if (device.hasOwnProperty("deviceid") && device.hasOwnProperty("error") && device.error === 504) {
            device.action = "sysmsg";
            device.params = {
               online: false
            };
         }
         // for external updates
         if (device.hasOwnProperty("config") && device.config.hb && device.config.hbInterval && !this.hbInterval) {
            this.hbInterval = setInterval(() => {
               this.ws.send("ping");
            }, (device.config.hbInterval + 7) * 1000);
         } else if (device.hasOwnProperty("action")) {
            switch (device.action) {
               case "sysmsg":
                  device.params.updateSource = "WS";
                  let returnTemplate = {
                     deviceid: device.deviceid,
                     action: "sysmsg",
                     params: device.params
                  };
                  if (this.debugReqRes) {
                     let msg = JSON.stringify(returnTemplate, null, 2).replace(device.deviceid, "**hidden**");
                     this.log("WS message received.\n%s", msg);
                  } else if (this.debug) {
                     this.log("WS message received.");
                  }
                  this.emitter.emit("update", returnTemplate);
                  break;
               case "update":
                  for (let param in device.params) {
                     if (device.params.hasOwnProperty(param)) {
                        if (!constants.paramsToKeep.includes(param.replace(/[0-9]/g, ""))) {
                           delete device.params[param];
                        }
                     }
                  }
                  if (Object.keys(device.params).length > 0) {
                     device.params.updateSource = "WS";
                     let returnTemplate = {
                        deviceid: device.deviceid,
                        action: "update",
                        params: device.params
                     };
                     if (this.debugReqRes) {
                        let msg = JSON.stringify(returnTemplate, null, 2).replace(device.deviceid, "**hidden**");
                        this.log("WS message received.\n%s", msg);
                     } else if (this.debug) {
                        this.log("WS message received.");
                     }
                     this.emitter.emit("update", returnTemplate);
                  }
                  break;
               default:
                  this.log.warn("[%s] WS message has unknown action.\n" + JSON.stringify(device, null, 2), device.deviceid);
                  return;
            }
         } else if (device.hasOwnProperty("error") && device.error === 0) {
            // *** Safe to ignore these messages *** \\
         } else {
            if (this.debug) {
               this.log.warn("WS unknown command received.\n" + JSON.stringify(device, null, 2));
            }
         }
      });
      this.ws.on("close", (e, m) => {
         if (m === "Stopping Homebridge") {
            this.log("Web socket gracefully closed.");
         } else {
            this.log.warn("Web socket closed - [%s - %s].", e, m);
            if (e !== 1000) {
               this.log("Web socket will try to reconnect in five seconds.");
               setTimeout(() => {
                  this.login();
               }, 5000);
            } else {
               this.log("Please try restarting Homebridge so that this plugin can work again.");
            }
         }
         this.wsIsOpen = false;
         if (this.hbInterval) {
            clearInterval(this.hbInterval);
            this.hbInterval = null;
         }
         this.ws.removeAllListeners();
      });
      this.ws.on("error", (e) => {
         this.log.error("Web socket error - [%s].", e);
         if (e.code === "ECONNREFUSED") {
            this.log.warn("Web socket will try to reconnect in five seconds then try the command again.");
            this.ws.removeAllListeners();
            setTimeout(() => {
               this.login();
            }, 5000);
         } else {
            this.log.warn("If this was unexpected then please try restarting Homebridge.");
         }
      });
   }
   sendUpdate(json) {
      json = {
         ...json,
         ...{
            action: "update",
            sequence: Math.floor(new Date()),
            userAgent: "app"
         }
      };
      let sendOperation = req => {
         if (!this.wsIsOpen) {
            setTimeout(() => {
               sendOperation(req);
            }, 280);
            return;
         }
         if (this.ws) {
            this.ws.send(req);
            if (this.debugReqRes) {
               let msg = JSON.stringify(json, null, 2).replace(json.apikey, "**hidden**").replace(json.apiKey, "**hidden**").replace(json.deviceid, "**hidden**");
               this.log.warn("WS message sent. This text is yellow for clarity.\n%s", msg);
            } else if (this.debug) {
               this.log("WS message sent.");
            }
            return;
         }
         this.delaySend = this.delaySend <= 0 ? 0 : this.delaySend -= 280;
      };
      let string = JSON.stringify(json);
      if (this.wsIsOpen) {
         setTimeout(sendOperation, this.delaySend, string);
         this.delaySend += 280;
      } else {
         this.log.warn("Web socket is currently reconnecting. Command will be resent.");
         let interval,
            waitToSend = req => {
               if (this.wsIsOpen) {
                  clearInterval(interval);
                  sendOperation(req);
               }
            };
         interval = setInterval(waitToSend, 2500, string);
      }
   }
   requestUpdate(accessory) {
      let json = {
            action: "query",
            apikey: accessory.context.eweApiKey,
            deviceid: accessory.context.eweDeviceId,
            params: [],
            sequence: Math.floor(new Date()),
            ts: 0,
            userAgent: "app"
         },
         sendOperation = req => {
            if (!this.wsIsOpen) {
               setTimeout(() => {
                  sendOperation(req);
               }, 280);
               return;
            }
            if (this.ws) {
               this.ws.send(req);
               if (this.debugReqRes) {
                  let msg = JSON.stringify(json, null, 2).replace(json.apikey, "**hidden**").replace(json.apiKey, "**hidden**").replace(json.deviceid, "**hidden**");
                  this.log.warn("WS message sent. This text is yellow for clarity.\n%s", msg);
               } else if (this.debug) {
                  this.log("WS message sent.");
               }
               return;
            }
            this.delaySend = this.delaySend <= 0 ? 0 : this.delaySend -= 280;
         },
         string = JSON.stringify(json);
      if (this.wsIsOpen) {
         setTimeout(sendOperation, this.delaySend, string);
         this.delaySend += 280;
      } else {
         this.log.warn("Web socket is currently reconnecting. Command will be resent.");
         let interval,
            waitToSend = req => {
               if (this.wsIsOpen) {
                  clearInterval(interval);
                  sendOperation(req);
               }
            };
         interval = setInterval(waitToSend, 2500, string);
      }
   }
   receiveUpdate(f) {
      this.emitter.addListener("update", f);
   }
   closeConnection() {
      if (this.ws && this.wsIsOpen) {
         this.ws.close(1000, "Stopping Homebridge");
      }
   }
};