/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceSwitchSingle {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.switchService = accessory.getService(this.Service.Switch) || accessory.addService(this.Service.Switch)
    this.switchService
      .getCharacteristic(this.Characteristic.On)
      .on('set', this.internalUpdate.bind(this))
    if (accessory.getService(this.Service.Outlet)) {
      accessory.removeService(accessory.getService(this.Service.Outlet))
    }
    accessory.log = this.log
    accessory.eveService = new this.platform.eveService('switch', accessory)
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      await this.helpers.sleep(Math.floor(Math.random() * 491 + 10))
      callback()
      await this.platform.sendDeviceUpdate(this.accessory, {
        switch: value ? 'on' : 'off'
      })
      this.cacheOnOff = value ? 'on' : 'off'
      this.accessory.eveService.addEntry({ status: value ? 1 : 0 })
      this.log('[%s] current state [%s].', this.accessory.displayName, value ? 'on' : 'off')
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switch || params.switch === this.cacheOnOff) return
      const newStatus = params.switch === 'on'
      this.switchService.updateCharacteristic(this.Characteristic.On, newStatus)
      this.cacheOnOff = params.switch
      this.accessory.eveService.addEntry({ status: newStatus ? 1 : 0 })
      if (params.updateSource) this.log('[%s] current state [%s].', this.accessory.displayName, params.switch)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
