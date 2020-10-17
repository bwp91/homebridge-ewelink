/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const eWeLinkPlatform = require('./lib/ewelink-platform.js')
module.exports = hb => hb.registerPlatform('homebridge-ewelink', 'eWeLink', eWeLinkPlatform)
