'use strict'
let Characteristic, Service
const cns = require('./../constants')
module.exports = class deviceUSB {
  constructor (platform) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
  }

  async internalUSBUpdate (accessory, value, callback) {
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

  externalUSBUpdate (accessory, params) {
    try {
      if (!Object.prototype.hasOwnProperty.call(params, 'switches')) return
      accessory.getService(Service.Outlet).updateCharacteristic(Characteristic.On, params.switches[0].switch === 'on')
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
