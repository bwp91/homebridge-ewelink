/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
let Characteristic, Service
const helpers = require('./../helpers')
module.exports = class deviceSCM {
  constructor (platform, accessory) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
    const scmService = accessory.getService(Service.Switch) || accessory.addService(Service.Switch)
    scmService
      .getCharacteristic(Characteristic.On)
      .on('set', (value, callback) => this.internalUpdate(accessory, value, callback))
  }

  async internalUpdate (accessory, value, callback) {
    callback()
    try {
      const params = {
        switches: helpers.defaultMultiSwitchOff
      }
      const switchService = accessory.getService(Service.Switch)
      params.switches[0].switch = value ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(accessory, params)
      switchService.updateCharacteristic(Characteristic.On, value)
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {
      if (!helpers.hasProperty(params, 'switches')) return
      accessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, params.switches[0].switch === 'on')
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
