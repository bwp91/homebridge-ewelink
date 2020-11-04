/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const helpers = require('./../helpers')
module.exports = class deviceDiffuser {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    const service = accessory.getService(this.Service.Lightbulb) || accessory.addService(this.Service.Lightbulb)
    service
      .getCharacteristic(this.Characteristic.On)
      .on('set', (value, callback) => this.internalSwitchUpdate(value, callback))
    this.accessory = accessory
  }

  async internalSwitchUpdate (value, callback) {
    callback()
    try {
      const params = { switch: value ? 'on' : 'off' }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!helpers.hasProperty(params, 'switch')) return
      this.accessory.getService(this.Service.Lightbulb).updateCharacteristic(this.Characteristic.On, params.switch === 'on')
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
