/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceSCM {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.service = accessory.getService(this.Service.Switch) || accessory.addService(this.Service.Switch)
    this.service.getCharacteristic(this.Characteristic.On)
      .on('set', this.internalUpdate.bind(this))
    accessory.log = platform.config.debugFakegato ? this.log : () => {}
    accessory.historyService = new this.platform.eveService('switch', accessory, {
      storage: 'fs',
      path: platform.eveLogPath
    })
    this.accessory = accessory
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
        this.log('[%s] current state [%s].', this.accessory.displayName, value ? 'on' : 'off')
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
      this.service.updateCharacteristic(this.Characteristic.On, newStatus)
      this.cacheOnOff = params.switches[0].switch
      this.accessory.historyService.addEntry({
        time: Math.round(new Date().valueOf() / 1000),
        status: newStatus ? 1 : 0
      })
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.accessory.displayName, params.switches[0].switch)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
