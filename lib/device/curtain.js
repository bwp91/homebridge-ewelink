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
      const params = {}
      if ([0, 100].includes(value)) {
        params.switch = value === 100 ? 'on' : 'off'
      } else {
        params.setclose = Math.abs(100 - value)
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switch && !this.helpers.hasProperty(params, 'setclose')) return
      const newPos = Math.abs(100 - parseInt(params.setclose))
      this.service
        .updateCharacteristic(this.Characteristic.TargetPosition, newPos)
        .updateCharacteristic(this.Characteristic.CurrentPosition, newPos)
        .updateCharacteristic(this.Characteristic.PositionState, 2)
      if (params.updateSource && this.cachePosition !== newPos) {
        this.cachePosition = newPos
        this.log('[%s] current position [%s%].', this.accessory.displayName, this.cachePosition)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
