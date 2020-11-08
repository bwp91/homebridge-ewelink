/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceLightCTemp {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    const lightService = accessory.getService(this.Service.Lightbulb) || accessory.addService(this.Service.Lightbulb)
    lightService
      .getCharacteristic(this.Characteristic.On)
      .on('set', (value, callback) => this.internalUpdate(accessory, 'onoff', value, callback))
    lightService
      .getCharacteristic(this.Characteristic.Brightness)
      .on('set', (value, callback) => this.internalUpdate(accessory, 'brightness', value, callback))
  }

  async internalUpdate (accessory, type, value, callback) {
    callback()
    try {

    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {

    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
