/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceUSB {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    if ((platform.config.outletAsSwitch || '').split(',').includes(this.accessory.context.eweDeviceId)) {
      if (this.accessory.getService(this.hapServ.Outlet)) {
        this.accessory.removeService(this.accessory.getService(this.hapServ.Outlet))
      }
      this.service = this.accessory.getService(this.hapServ.Switch) || this.accessory.addService(this.hapServ.Switch)
    } else {
      if (this.accessory.getService(this.hapServ.Switch)) {
        this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
      }
      this.service = this.accessory.getService(this.hapServ.Outlet) || this.accessory.addService(this.hapServ.Outlet)
    }
    this.service.getCharacteristic(this.hapChar.On)
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
      const params = { switches: this.consts.defaultMultiSwitchOff }
      params.switches[0].switch = value ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheOnOff = value ? 'on' : 'off'
      this.accessory.historyService.addEntry({
        time: Math.round(new Date().valueOf() / 1000),
        status: value ? 1 : 0
      })
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, value ? 'on' : 'off')
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
      this.service.updateCharacteristic(this.hapChar.On, newStatus)
      this.cacheOnOff = params.switches[0].switch
      this.accessory.historyService.addEntry({
        time: Math.round(new Date().valueOf() / 1000),
        status: newStatus ? 1 : 0
      })
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, params.switches[0].switch)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
