/* jshint esversion: 9, -W030, node: true */
"use strict";
module.exports = function (homebridge) {
  const eWeLink = require("./lib/eWeLink.js")(homebridge);
  homebridge.registerPlatform("homebridge-ewelink", "eWeLink", eWeLink, true);
};
