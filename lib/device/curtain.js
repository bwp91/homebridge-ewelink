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
    if (!(this.cService = accessory.getService(this.Service.WindowCovering))) {
      this.cService = accessory.addService(this.Service.WindowCovering)
      this.cService
        .setCharacteristic(this.Characteristic.CurrentPosition, 0)
        .setCharacteristic(this.Characteristic.TargetPosition, 0)
        .setCharacteristic(this.Characteristic.PositionState, 2)
    }
    this.cService
      .getCharacteristic(this.Characteristic.TargetPosition)
      .on('set', this.internalUpdate.bind(this))
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      let params
      const prevPos = this.accessory.context.cacheCurrentPosition
      const newPos = value
      if (newPos === prevPos) return
      if (newPos === 0 || newPos === 100) {
        params = { switch: newPos === 100 ? 'on' : 'off' }
      } else {
        params = { setclose: Math.abs(100 - newPos) }
      }
      this.accessory.context.cacheCurrentPosition = newPos
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!this.helpers.hasProperty(params, 'switch') && !this.helpers.hasProperty(params, 'setclose')) {
        return
      }
      const newPos = Math.abs(100 - parseInt(params.setclose))
      this.cService
        .updateCharacteristic(this.Characteristic.TargetPosition, newPos)
        .updateCharacteristic(this.Characteristic.CurrentPosition, newPos)
        .updateCharacteristic(this.Characteristic.PositionState, 2)
      this.accessory.context.cacheCurrentPosition = newPos
      return
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
