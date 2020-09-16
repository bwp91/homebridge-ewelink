/* jshint esversion: 9, -W030, node: true */
"use strict";
const axios = require("axios"),
  constants = require("./constants"),
  crypto = require("crypto");
module.exports = class eWeLinkHTTP {
  constructor(config, log) {
    this.log = log;
    this.debug = config.debug || false;
    this.debugReqRes = config.debugReqRes || false;
    this.username = config.username.toString();
    this.password = config.password.toString();
    this.cCode = "+" + config.countryCode.toString().replace("+", "").replace(" ", "");
  }
  getHost() {
    let data = {
        appid: constants.appId,
        country_code: this.cCode,
        nonce: Math.random().toString(36).substr(2, 8),
        ts: Math.floor(new Date().getTime() / 1000),
        version: 8,
      },
      dataToSign = [];
    Object.keys(data).forEach(k => {
      dataToSign.push({
        key: k,
        value: data.k,
      });
    });
    dataToSign.sort((a, b) => (a.key < b.key ? -1 : 1));
    dataToSign = dataToSign.map(k => k.key + "=" + k.value).join("&");
    dataToSign = crypto
      .createHmac("sha256", constants.appSecret)
      .update(dataToSign)
      .digest("base64");
    if (this.debugReqRes) {
      let msg = JSON.stringify(data, null, 2);
      this.log.warn("Sending HTTP getHost request. This text is yellow for clarity.\n%s", msg);
    } else if (this.debug) {
      this.log("Sending HTTP getHost request.");
    }
    return new Promise((resolve, reject) => {
      axios
        .get("https://api.coolkit.cc:8080/api/user/region", {
          headers: {
            Authorization: "Sign " + dataToSign,
            "Content-Type": "application/json",
          },
          params: data,
        })
        .then(res => {
          let body = res.data;
          if (!body.region) {
            throw "Server did not respond with a region.\n" + JSON.stringify(body, null, 2);
          }
          switch (body.region) {
            case "eu":
            case "us":
            case "as":
              this.httpHost = body.region + "-apia.coolkit.cc";
              break;
            case "cn":
              this.httpHost = "cn-apia.coolkit.cn";
              break;
            default:
              throw "No valid region received - [" + body.region + "].";
          }
          if (this.debug) {
            this.log("HTTP API host received [%s].", this.httpHost);
          }
          resolve(this.httpHost);
        })
        .catch(err => {
          if (err.hasOwnProperty("code") && ["ENOTFOUND", "ETIMEDOUT"].includes(err.code)) {
            this.log.warn("Unable to reach eWeLink. Retrying in 30 seconds.");
            this.delay().then(() => resolve(this.getHost()));
          } else {
            reject(err.message || err);
          }
        });
    });
  }
  login() {
    let data = {
      countryCode: this.cCode,
      password: this.password,
    };
    this.username.includes("@") ? (data.email = this.username) : (data.phoneNumber = this.username);
    if (this.debugReqRes) {
      let msg = JSON.stringify(data, null, 2)
        .replace(this.password, "**hidden**")
        .replace(this.username, "**hidden**");
      this.log.warn("Sending HTTP login request. This text is yellow for clarity.\n%s", msg);
    } else if (this.debug) {
      this.log("Sending HTTP login request.");
    }
    let dataToSign = crypto
      .createHmac("sha256", constants.appSecret)
      .update(JSON.stringify(data))
      .digest("base64");
    return new Promise((resolve, reject) => {
      axios({
        url: "https://" + this.httpHost + "/v2/user/login",
        method: "post",
        headers: {
          Authorization: "Sign " + dataToSign,
          "Content-Type": "application/json",
          Host: this.httpHost,
          "X-CK-Appid": constants.appId,
          "X-CK-Nonce": Math.random().toString(36).substr(2, 8),
        },
        data,
      })
        .then(res => {
          let body = res.data;
          if (
            body.hasOwnProperty("error") &&
            body.error === 10004 &&
            body.hasOwnProperty("data") &&
            body.data.hasOwnProperty("region")
          ) {
            let givenRegion = body.data.region;
            switch (givenRegion) {
              case "eu":
              case "us":
              case "as":
                this.httpHost = givenRegion + "-apia.coolkit.cc";
                break;
              case "cn":
                this.httpHost = "cn-apia.coolkit.cn";
                break;
              default:
                throw "No valid region received - [" + givenRegion + "].";
            }
            if (this.debug) {
              this.log("New HTTP API host received [%s].", this.httpHost);
            }
            resolve(this.login());
            return;
          }
          if (!body.data.at) {
            throw "No auth token received.\n" + JSON.stringify(body, null, 2);
          }
          this.aToken = body.data.at;
          this.apiKey = body.data.user.apikey;
          resolve({
            aToken: body.data.at,
            apiKey: body.data.user.apikey,
            httpHost: this.httpHost,
          });
        })
        .catch(err => reject(err.message || err));
    });
  }
  getDevices() {
    return new Promise((resolve, reject) => {
      axios
        .get("https://" + this.httpHost + "/v2/device/thing", {
          headers: {
            Authorization: "Bearer " + this.aToken,
            "Content-Type": "application/json",
            Host: this.httpHost,
            "X-CK-Appid": constants.appId,
            "X-CK-Nonce": Math.random().toString(36).substr(2, 8),
          },
        })
        .then(res => {
          let body = res.data;
          if (
            !body.hasOwnProperty("data") ||
            !body.hasOwnProperty("error") ||
            (body.hasOwnProperty("error") && body.error !== 0)
          ) {
            throw JSON.stringify(body, null, 2);
          }
          let deviceList = [];
          if (body.data.thingList && body.data.thingList.length > 0) {
            body.data.thingList.forEach(device => deviceList.push(device.itemData));
          }
          resolve(deviceList);
        })
        .catch(err => {
          if (err.hasOwnProperty("code") && ["ENOTFOUND", "ETIMEDOUT"].includes(err.code)) {
            this.log.warn("Unable to reach eWeLink. Retrying in 30 seconds.");
            this.delay().then(() => resolve(this.getDevices()));
          } else {
            reject(err.message || err);
          }
        });
    });
  }

  getDevice(deviceId) {
    return new Promise((resolve, reject) => {
      axios({
        url: "https://" + this.httpHost + "/v2/device/thing",
        method: "post",
        headers: {
          Authorization: "Bearer " + this.aToken,
          "Content-Type": "application/json",
          Host: this.httpHost,
          "X-CK-Appid": constants.appId,
          "X-CK-Nonce": Math.random().toString(36).substr(2, 8),
        },
        data: {
          thingList: [
            {
              itemType: 1,
              id: deviceId,
            },
          ],
        },
      })
        .then(res => {
          let body = res.data;
          if (
            !body.hasOwnProperty("data") ||
            !body.hasOwnProperty("error") ||
            (body.hasOwnProperty("error") && body.error !== 0)
          ) {
            throw JSON.stringify(body, null, 2);
          }
          if (body.data.thingList && body.data.thingList.length === 1) {
            resolve(body.data.thingList[0].itemData);
          } else {
            throw "device not found in eWeLink";
          }
        })
        .catch(err => {
          if (err.hasOwnProperty("code") && ["ENOTFOUND", "ETIMEDOUT"].includes(err.code)) {
            this.log.warn("Unable to reach eWeLink. Retrying in 30 seconds.");
            this.delay().then(() => resolve(this.getDevice(deviceId)));
          } else {
            reject(err.message || err);
          }
        });
    });
  }

  delay() {
    return new Promise(resolve => setTimeout(resolve, 30000));
  }
};
