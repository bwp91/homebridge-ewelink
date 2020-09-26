/* jshint esversion: 9, -W014, -W030, node: true */
"use strict";
const axios = require("axios"),
  cns = require("./constants"),
  eventemitter = require("events"),
  utils = require("./utils"),
  ws = require("ws"),
  wsp = require("websocket-as-promised");
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
    return new Promise(async (resolve, reject) => {
      try {
        let res = await axios({
          method: "post",
          url: "https://" + this.httpHost.replace("-api", "-disp") + "/dispatch/app",
          headers: {
            Authorization: "Bearer " + this.aToken,
            "Content-Type": "application/json",
          },
          data: {
            appid: cns.appId,
            nonce: Math.random().toString(36).substr(2, 8),
            ts: Math.floor(new Date().getTime() / 1000),
            version: 8,
          },
        });
        let body = res.data;
        if (!body.domain) {
          throw "Server did not respond with a web socket host.";
        }
        if (this.debug) {
          this.log("Web socket host received [%s].", body.domain);
        }
        this.wsHost = body.domain;
        resolve(body.domain);
      } catch (err) {
        if (err.hasOwnProperty("code") && ["ENOTFOUND", "ETIMEDOUT"].includes(err.code)) {
          this.log.warn("Unable to reach eWeLink. Retrying in 30 seconds.");
          await utils.sleep(30000);
          resolve(this.getDevices());
        } else {
          reject(err.message || err);
        }
      }
    });
  }
  login() {
    this.wsp = new wsp("wss://" + this.wsHost + ":8080/api/ws", {
      createWebSocket: url => new ws(url),
      extractMessageData: event => event,
      attachRequestId: (data, requestId) =>
        Object.assign(
          {
            sequence: requestId,
          },
          data
        ),
      extractRequestId: data => data && data.sequence,
      packMessage: data => JSON.stringify(data),
      unpackMessage: data => {
        return data === "pong" ? data : JSON.parse(data);
      },
    });
    this.wsp.open();
    this.wsp.onOpen.addListener(async () => {
      this.wsIsOpen = true;
      let sequence = Math.floor(new Date()).toString(),
        payload = {
          action: "userOnline",
          apikey: this.apiKey,
          appid: cns.appId,
          at: this.aToken,
          nonce: Math.random().toString(36).substr(2, 8),
          sequence,
          ts: Math.floor(new Date() / 1000),
          userAgent: "app",
          version: 8,
        };
      if (this.debugReqRes) {
        let msg = JSON.stringify(payload, null, 2)
          .replace(this.aToken, "**hidden**")
          .replace(this.apiKey, "**hidden**");
        this.log.warn("Sending WS login request. This text is yellow for clarity.\n%s", msg);
      } else if (this.debug) {
        this.log("Sending WS login request.");
      }
      try {
        let res = await this.wsp.sendRequest(payload, {
          requestId: sequence,
        });
        if (res.hasOwnProperty("config") && res.config.hb && res.config.hbInterval && !this.hbInterval) {
          this.hbInterval = setInterval(() => {
            this.wsp.send("ping");
          }, (res.config.hbInterval + 7) * 1000);
        } else {
          throw "Unknown parameters received";
        }
      } catch (err) {
        this.log.error("WS login failed [%s].", err);
      }
    });
    this.wsp.onUnpackedMessage.addListener(device => {
      if (device === "pong") return;
      let onlineStatus = true;
      if (!device.hasOwnProperty("params")) device.params = {};
      if (device.hasOwnProperty("deviceid") && device.hasOwnProperty("error")) {
        device.action = "update";
        onlineStatus = device.error === 0;
      }
      if (device.hasOwnProperty("action")) {
        switch (device.action) {
          case "update":
          case "sysmsg":
            if (device.action === "sysmsg" && device.params.hasOwnProperty("online")) {
              onlineStatus = device.params.online;
            }
            for (let param in device.params) {
              if (device.params.hasOwnProperty(param)) {
                if (!cns.paramsToKeep.includes(param.replace(/[0-9]/g, ""))) {
                  delete device.params[param];
                }
              }
            }
            device.params.online = onlineStatus;
            device.params.updateSource = "WS";
            if (Object.keys(device.params).length > 0) {
              let returnTemplate = {
                deviceid: device.deviceid,
                params: device.params,
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
          case "reportSubDevice":
            return;
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
    this.wsp.onClose.addListener((e, m) => {
      this.wsIsOpen = false;
      if (e !== 1005) {
        this.log.warn("Web socket closed [%s].", e);
        if (e !== 1000) {
          this.log("Web socket will try to reconnect in five seconds.");
          setTimeout(() => this.login(), 5000);
        } else {
          this.log("Please try restarting Homebridge so that this plugin can work again.");
        }
      }
      if (this.hbInterval) {
        clearInterval(this.hbInterval);
        this.hbInterval = null;
      }
      this.wsp.removeAllListeners();
    });
    this.wsp.onError.addListener(e => {
      this.log.error("Web socket error - [%s].", e);
      if (e.code === "ECONNREFUSED") {
        this.log.warn("Web socket will try to reconnect in five seconds then try the command again.");
        this.wsp.removeAllListeners();
        setTimeout(() => this.login(), 5000);
      } else {
        this.log.warn("If this was unexpected then please try restarting Homebridge.");
      }
    });
  }
  sendUpdate(json) {
    return new Promise(async (resolve, reject) => {
      let sequence = Math.floor(new Date()).toString(),
        jsonToSend = {
          ...json,
          ...{
            action: "update",
            sequence,
            userAgent: "app",
          },
        };
      if (this.wsp && this.wsIsOpen) {
        try {
          let device = await this.wsp.sendRequest(jsonToSend, {
            requestId: sequence,
          });
          if (this.debugReqRes) {
            let msg = JSON.stringify(json, null, 2)
              .replace(json.apikey, "**hidden**")
              .replace(json.apiKey, "**hidden**")
              .replace(json.deviceid, "**hidden**");
            this.log.warn("WS message sent. This text is yellow for clarity.\n%s", msg);
          } else if (this.debug) {
            this.log("WS message sent.");
          }
          device.error = device.hasOwnProperty("error") ? device.error : 504; // mimic ewelink device offline
          switch (device.error) {
            case 0:
              resolve();
              break;
            default:
              throw "Unknown response";
          }
        } catch (err) {
          reject("device update failed [" + err + "]");
        }
      } else {
        if (this.debug) {
          this.log.warn("Command will be resent when WS is reconnected.");
        }
        await utils.sleep(30000);
        resolve(this.sendUpdate(json));
      }
    });
  }
  requestUpdate(accessory) {
    return new Promise(async resolve => {
      let sequence = Math.floor(new Date()).toString(),
        json = {
          action: "query",
          apikey: accessory.context.eweApiKey,
          deviceid: accessory.context.eweDeviceId,
          params: [],
          sequence,
          ts: 0,
          userAgent: "app",
        };

      if (this.wsp && this.wsIsOpen) {
        this.wsp.send(JSON.stringify(json));
        if (this.debugReqRes) {
          let msg = JSON.stringify(json, null, 2)
            .replace(json.apikey, "**hidden**")
            .replace(json.apiKey, "**hidden**")
            .replace(json.deviceid, "**hidden**");
          this.log.warn("WS message sent. This text is yellow for clarity.\n%s", msg);
        } else if (this.debug) {
          this.log("WS message sent.");
        }
      } else {
        if (this.debug) {
          this.log.warn("Command will be resent when WS is reconnected.");
        }
        await utils.sleep(30000);
        resolve(this.requestUpdate(accessory));
      }
    });
  }
  receiveUpdate(f) {
    this.emitter.addListener("update", f);
  }
  closeConnection() {
    return new Promise(async (resolve, reject) => {
      if (this.wsp && this.wsIsOpen) {
        try {
          await this.wsp.close();
          this.log("Web socket gracefully closed.");
          resolve();
        } catch (err) {
          reject(err);
        }
      }
      resolve();
    });
  }
};
