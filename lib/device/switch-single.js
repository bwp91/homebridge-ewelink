/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const fakegato = require('./../fakegato/fakegato-history')
const helpers = require('./../helpers')
module.exports = class deviceSwitchSingle {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.EveHistoryService = fakegato(platform.api)
    const switchService = accessory.getService(this.Service.Switch) || accessory.addService(this.Service.Switch)
    switchService
      .getCharacteristic(this.Characteristic.On)
      .on('set', (value, callback) => this.internalUpdate(accessory, value, callback))
    if (accessory.getService(this.Service.Outlet)) {
      accessory.removeService(accessory.getService(this.Service.Outlet))
    }
    if (accessory.getService(this.Service.Lightbulb)) {
      accessory.removeService(accessory.getService(this.Service.Lightbulb))
    }
    accessory.log = this.platform.log
    accessory.eveLogger = new this.EveHistoryService('switch', accessory, {
      storage: 'fs',
      path: this.platform.eveLogPath
    })
  }

  async internalUpdate (accessory, value, callback) {
    try {
      callback()
      const params = { switch: value ? 'on' : 'off' }
      await this.platform.sendDeviceUpdate(accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {
      if (!helpers.hasProperty(params, 'switch')) return
      accessory.getService(this.Service.Switch).updateCharacteristic(this.Characteristic.On, params.switch === 'on')
      accessory.eveLogger.addEntry({
        time: Math.round(new Date().valueOf() / 1000),
        status: params.switch === 'on' ? 1 : 0
      })
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
