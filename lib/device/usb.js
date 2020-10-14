/* jshint -W014, -W033, esversion: 9 */
'use strict'
let Characteristic, Service
const cns = require('./../constants')
const utils = require('./../utils')
module.exports = class deviceUSB {
  constructor (platform, accessory) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
    const usbService = accessory.getService(Service.Outlet) || accessory.addService(Service.Outlet)
    usbService
      .getCharacteristic(Characteristic.On)
      .on('set', (value, callback) => this.internalUpdate(accessory, value, callback))
  }

  async internalUpdate (accessory, value, callback) {
    callback()
    try {
      const params = {
        switches: cns.defaultMultiSwitchOff
      }
      const outletService = accessory.getService(Service.Outlet)
      params.switches[0].switch = value ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(accessory, params)
      outletService.updateCharacteristic(Characteristic.On, value)
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {
      if (!utils.hasProperty(params, 'switches')) return
      accessory.getService(Service.Outlet).updateCharacteristic(Characteristic.On, params.switches[0].switch === 'on')
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
