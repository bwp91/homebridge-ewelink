/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceThermostat {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory
    /*
      **************
      *** PARAMS ***
      **************
      "volatility": 1, // Deviation
      "targetTemp": 20, // C or F In 0.5
      "workMode": 1, // 1=manual, 2=programmed 3=economical
      "switch": "on",
      "temperature": 29, // C or F In 0.5
      "fault": 0, // Not Sure
      "workState": 2, // 1=heating, 2=auto
      "tempScale": "c", // guessing "f"
      "childLock": "off", // Guessing "on"
      "mon": "016800c801e0009602b20096032a009603fc00dc05280096",
      "tues": "016800c801e0009602b20096032a009603fc00dc05280096",
      "wed": "016800c801e0009602b20096032a009603fc00dc05280096",
      "thur": "016800c801e0009602b20096032a009603fc00dc05280096",
      "fri": "016800c801e0009602b20096032a009603fc00dc05280096",
      "sat": "016800c801e000c802b200c8032a00c803fc00c805280096",
      "sun": "016800c801e000c802b200c8032a00c803fc00c805280096",
    */

    // Add the thermostat service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.Thermostat) ||
      this.accessory.addService(this.hapServ.Thermostat)

    /*
    // Add the set handler to the switch on/off characteristic
    this.service.getCharacteristic(this.hapChar.On)
      .on('set', this.internalUpdate.bind(this))
    */
  }

  async internalUpdate (value, callback) {
    try {
      callback()
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {

    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
