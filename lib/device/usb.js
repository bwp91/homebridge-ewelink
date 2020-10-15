/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const helpers = require('./../helpers')
module.exports = class deviceUSB {
  constructor (platform, accessory) {
    this.platform = platform
    this.accessory = accessory
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    const usbService = accessory.getService(this.Service.Outlet) || accessory.addService(this.Service.Outlet)
    usbService
      .getCharacteristic(this.Characteristic.On)
      .on('set', (value, callback) => this.internalUpdate(value, callback))
  }

  async internalUpdate (value, callback) {
    callback()
    try {
      const params = { switches: helpers.defaultMultiSwitchOff }
      const outletService = this.accessory.getService(this.Service.Outlet)
      params.switches[0].switch = value ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      outletService.updateCharacteristic(this.Characteristic.On, value)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!helpers.hasProperty(params, 'switches')) return
      this.accessory.getService(this.Service.Outlet).updateCharacteristic(this.Characteristic.On, params.switches[0].switch === 'on')
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
