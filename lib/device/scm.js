'use strict'
let Characteristic, Service
const cns = require('./../constants')
module.exports = class deviceSCM {
  constructor (platform) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
  }

  async internalUpdate (accessory, value, callback) {
    callback()
    try {
      const params = {
        switches: cns.defaultMultiSwitchOff
      }
      const switchService = accessory.getService(Service.Switch)
      params.switches[0].switch = value ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(accessory, params)
      switchService.updateCharacteristic(Characteristic.On, value)
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  externalUpdate (accessory, params) {
    try {
      if (!Object.prototype.hasOwnProperty.call(params, 'switches')) return
      accessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, params.switches[0].switch === 'on')
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
