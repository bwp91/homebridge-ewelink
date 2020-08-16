/* jshint esversion: 9, -W030, node: true */
"use strict";
const constants = require("./lib/constants");
module.exports = function (homebridge) {
   let eWeLink = require("./lib/eWeLink.js")(homebridge);
   homebridge.registerPlatform(constants.packageName, "eWeLink", eWeLink, true);
};