/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceUSB {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    this.dName = accessory.displayName
    this.accessory = accessory

    if ((platform.config.outletAsSwitch || '').split(',').includes(this.accessory.context.eweDeviceId)) {
      if (this.accessory.getService(this.S.Outlet)) {
        this.accessory.removeService(this.accessory.getService(this.S.Outlet))
      }
      this.service = this.accessory.getService(this.S.Switch) || this.accessory.addService(this.S.Switch)
    } else {
      if (this.accessory.getService(this.S.Switch)) {
        this.accessory.removeService(this.accessory.getService(this.S.Switch))
      }
      this.service = this.accessory.getService(this.S.Outlet) || this.accessory.addService(this.S.Outlet)
    }
    this.service.getCharacteristic(this.C.On)
      .on('set', this.internalUpdate.bind(this))
    this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
    this.accessory.historyService = new this.platform.eveService('switch', this.accessory, {
      storage: 'fs',
      path: platform.eveLogPath
    })
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      params.switches[0].switch = value ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheOnOff = value ? 'on' : 'off'
      this.accessory.historyService.addEntry({
        time: Math.round(new Date().valueOf() / 1000),
        status: value ? 1 : 0
      })
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.dName, value ? 'on' : 'off')
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switches || params.switches[0].switch === this.cacheOnOff) {
        return
      }
      const newStatus = params.switches[0].switch === 'on'
      this.service.updateCharacteristic(this.C.On, newStatus)
      this.cacheOnOff = params.switches[0].switch
      this.accessory.historyService.addEntry({
        time: Math.round(new Date().valueOf() / 1000),
        status: newStatus ? 1 : 0
      })
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.dName, params.switches[0].switch)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
