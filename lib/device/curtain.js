/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceCurtain {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    this.service = accessory.getService(this.S.WindowCovering) || accessory.addService(this.S.WindowCovering)
    this.service.getCharacteristic(this.C.TargetPosition)
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
      if (!params.switch && !this.helpers.hasProperty(params, 'setclose')) {
        return
      }
      const newPos = Math.abs(100 - parseInt(params.setclose))
      this.service.updateCharacteristic(this.C.TargetPosition, newPos)
        .updateCharacteristic(this.C.CurrentPosition, newPos)
        .updateCharacteristic(this.C.PositionState, 2)
      if (params.updateSource && this.cachePosition !== newPos) {
        this.cachePosition = newPos
        if (!this.disableDeviceLogging) {
          this.log('[%s] current position [%s%].', this.accessory.displayName, this.cachePosition)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
