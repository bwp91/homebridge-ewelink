/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceUSB {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.debugDevice = platform.config.debugDevice || false
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    if ((platform.config.outletAsSwitch || '').split(',').includes(accessory.context.eweDeviceId)) {
      if (accessory.getService(this.Service.Outlet)) {
        accessory.removeService(accessory.getService(this.Service.Outlet))
      }
      this.service = accessory.getService(this.Service.Switch) || accessory.addService(this.Service.Switch)
    } else {
      if (accessory.getService(this.Service.Switch)) {
        accessory.removeService(accessory.getService(this.Service.Switch))
      }
      this.service = accessory.getService(this.Service.Outlet) || accessory.addService(this.Service.Outlet)
    }
    this.service
      .getCharacteristic(this.Characteristic.On)
      .on('set', this.internalUpdate.bind(this))
    accessory.log = this.log
    accessory.eveService = new this.platform.eveService('switch', accessory)
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      params.switches[0].switch = value ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!this.helpers.hasProperty(params, 'switches')) return
      this.service.updateCharacteristic(this.Characteristic.On, params.switches[0].switch === 'on')
      this.accessory.eveService.addEntry({ status: params.switches[0].switch === 'on' ? 1 : 0 })
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
