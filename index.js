/* jshint -W014, -W033, esversion: 9 */
'use strict'
module.exports = function (homebridge) {
  const eWeLink = require('./lib/eWeLink.js')(homebridge)
  homebridge.registerPlatform('homebridge-ewelink', 'eWeLink', eWeLink, true)
}
