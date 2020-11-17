/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const helpers = require('./../helpers')
module.exports = class deviceUSB {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.outletService = accessory.getService(this.Service.Outlet) || accessory.addService(this.Service.Outlet)
    this.outletService
      .getCharacteristic(this.Characteristic.On)
      .on('set', this.internalUpdate.bind(this))
    accessory.log = this.platform.log
    accessory.eveLogger = new this.platform.eveService('switch', accessory, {
      storage: 'fs',
      path: this.platform.eveLogPath
    })
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      const params = { switches: helpers.defaultMultiSwitchOff }
      params.switches[0].switch = value ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!helpers.hasProperty(params, 'switches')) return
      this.outletService.updateCharacteristic(this.Characteristic.On, params.switches[0].switch === 'on')
      this.accessory.eveLogger.addEntry({
        time: Math.round(new Date().valueOf() / 1000),
        status: params.switches[0].switch === 'on' ? 1 : 0
      })
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
