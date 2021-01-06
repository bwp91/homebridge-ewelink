/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceCurtain {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.service = accessory.getService(this.Service.WindowCovering) || accessory.addService(this.Service.WindowCovering)
    this.service
      .getCharacteristic(this.Characteristic.TargetPosition)
      .on('set', this.internalUpdate.bind(this))
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      if (value === this.cachePosition) return
      const params = {}
      this.cachePosition = value
      if ([0, 100].includes(this.cachePosition)) {
        params.switch = this.cachePosition === 100 ? 'on' : 'off'
      } else {
        params.setclose = Math.abs(100 - this.cachePosition)
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.log('[%s] current position [%s%].', this.accessory.displayName, this.cachePosition)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switch && !this.helpers.hasProperty(params, 'setclose')) return
      const pos = Math.abs(100 - parseInt(params.setclose))
      if (this.cachePosition === pos) return
      this.cachePosition = pos
      this.service
        .updateCharacteristic(this.Characteristic.TargetPosition, this.cachePosition)
        .updateCharacteristic(this.Characteristic.CurrentPosition, this.cachePosition)
        .updateCharacteristic(this.Characteristic.PositionState, 2)
      if (params.updateSource) this.log('[%s] current position [%s%].', this.accessory.displayName, this.cachePosition)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
