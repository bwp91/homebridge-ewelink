/* jshint esversion: 9, -W030, node: true */
"use strict";
const axios = require("axios");
const constants = require("./constants");
const crypto = require("crypto");
module.exports = class eWeLinkHTTP {
   constructor(config, log) {
      this.config = config;
      this.log = log;
      this.debug = this.config.debug || false;
      this.debugReqRes = this.config.debugReqRes || false;
   }
   login() {
      let data = {
         countryCode: "+" + this.config.countryCode.toString().replace("+", "").replace(" ", ""),
         password: this.config.password
      };
      this.config.username.includes("@") ?
         data.email = this.config.username :
         data.phoneNumber = this.config.username;
      if (this.debugReqRes) {
         let msg = JSON.stringify(data, null, 2).replace(this.config.password, "**hidden**").replace(this.config.username, "**hidden**");
         this.log.warn("Sending HTTP login request. This text is yellow for clarity.\n%s", msg);
      } else if (this.debug) {
         this.log("Sending HTTP login request.");
      }
      let dataToSign = crypto.createHmac("sha256", "6Nz4n0xA8s8qdxQf2GqurZj2Fs55FUvM").update(JSON.stringify(data)).digest("base64");
      return new Promise((resolve, reject) => {
         axios({
            url: "https://" + this.httpHost + "/v2/user/login",
            method: "post",
            headers: {
               Authorization: "Sign " + dataToSign,
               "Content-Type": "application/json",
               Host: this.httpHost,
               "X-CK-Appid": constants.appId,
               "X-CK-Nonce": Math.random().toString(36).substr(2, 8)
            },
            data
         }).then(res => {
            let body = res.data;
            if (body.hasOwnProperty("error") && body.error === 10004 && body.hasOwnProperty("data") && body.data.hasOwnProperty("region")) {
               switch (body.data.region) {
                  case "eu":
                  case "us":
                  case "as":
                     this.httpHost = body.data.region + "-apia.coolkit.cc";
                     break;
                  case "cn":
                     this.httpHost = "cn-apia.coolkit.cn";
                     break;
                  default:
                     throw "No valid region received - [" + body.data.region + "].";
               }
               if (this.debug) {
                  this.log("New HTTP API host received [%s].", this.httpHost);
               }
               resolve(this.login());
               return;
            }
            if (!body.data.at) {
               throw "Server did not respond with an authentication token. Please double check your eWeLink username and password in the Homebridge configuration.\n" + JSON.stringify(body, null, 2);
            }
            this.aToken = body.data.at;
            this.apiKey = body.data.user.apikey;
            resolve({
               aToken: body.data.at,
               apiKey: body.data.user.apikey,
               httpHost: this.httpHost
            });
         }).catch(err => {
            reject(err);
         });
      });
   }
   getHost() {
      let data = {
            appid: constants.appId,
            country_code: this.config.countryCode.toString().replace("+", "").replace(" ", ""),
            nonce: Math.random().toString(36).substr(2, 8),
            ts: Math.floor(new Date().getTime() / 1000),
            version: 8
         },
         dataToSign = [];
      Object.keys(data).forEach(function(key) {
         dataToSign.push({
            key: key,
            value: data[key]
         });
      });
      dataToSign.sort(function(a, b) {
         return a.key < b.key ? -1 : 1;
      });
      dataToSign = dataToSign.map(function(kv) {
         return kv.key + "=" + kv.value;
      }).join("&");
      dataToSign = crypto.createHmac("sha256", "6Nz4n0xA8s8qdxQf2GqurZj2Fs55FUvM").update(dataToSign).digest("base64");
      return new Promise((resolve, reject) => {
         axios.get("https://api.coolkit.cc:8080/api/user/region", {
            headers: {
               Authorization: "Sign " + dataToSign,
               "Content-Type": "application/json"
            },
            params: data
         }).then(res => {
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
         }).catch(err => {
            reject(err);
         });
      });
   }
   getDevices() {
      return new Promise((resolve, reject) => {
         axios.get("https://" + this.httpHost + "/v2/device/thing", {
            headers: {
               Authorization: "Bearer " + this.aToken,
               "Content-Type": "application/json",
               Host: this.httpHost,
               "X-CK-Appid": constants.appId,
               "X-CK-Nonce": Math.random().toString(36).substr(2, 8)
            }
         }).then(res => {
            let body = res.data;
            if (!body.hasOwnProperty("error") || (body.hasOwnProperty("error") && body.error !== 0)) {
               throw JSON.stringify(body, null, 2);
            }
            let deviceList = [];
            if (body.data.thingList && body.data.thingList.length > 0) {
               body.data.thingList.forEach(device => deviceList.push(device.itemData));
            }
            resolve(deviceList);
         }).catch(err => {
            reject(err);
         });
      });
   }
};