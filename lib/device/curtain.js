/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const helpers = require('./../helpers')
module.exports = class deviceCurtain {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    let cService
    if (!(cService = accessory.getService(this.Service.WindowCovering))) {
      accessory
        .addService(this.Service.WindowCovering)
        .setCharacteristic(this.Characteristic.CurrentPosition, 0)
        .setCharacteristic(this.Characteristic.TargetPosition, 0)
        .setCharacteristic(this.Characteristic.PositionState, 2)
      cService = accessory.getService(this.Service.WindowCovering)
    }
    cService
      .getCharacteristic(this.Characteristic.TargetPosition)
      .on('set', (value, callback) => this.internalUpdate(value, callback))
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    callback()
    try {
      let params
      const cService = this.accessory.getService(this.Service.WindowCovering)
      const prevPos = this.accessory.context.cacheCurrentPosition
      const newPos = value
      if (newPos === prevPos) return
      if (newPos === 0 || newPos === 100) {
        params = { switch: newPos === 100 ? 'on' : 'off' }
      } else {
        params = { setclose: Math.abs(100 - newPos) }
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      cService
        .updateCharacteristic(this.Characteristic.TargetPosition, newPos)
        .updateCharacteristic(this.Characteristic.PositionState, newPos > prevPos ? 1 : 0)
      this.accessory.context.cacheCurrentPosition = newPos
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      const cService = this.accessory.getService(this.Service.WindowCovering)
      if (!helpers.hasProperty(params, 'switch') && !helpers.hasProperty(params, 'setclose')) {
        return
      }
      const newPos = Math.abs(100 - parseInt(params.setclose))
      cService
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
