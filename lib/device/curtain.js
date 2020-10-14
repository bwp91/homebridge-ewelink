/* jshint -W014, -W033, esversion: 9 */
'use strict'
let Characteristic, Service
const utils = require('./../utils')
module.exports = class deviceCurtain {
  constructor (platform, accessory) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
    let cService
    if (!(cService = accessory.getService(Service.WindowCovering))) {
      accessory
        .addService(Service.WindowCovering)
        .setCharacteristic(Characteristic.CurrentPosition, 0)
        .setCharacteristic(Characteristic.TargetPosition, 0)
        .setCharacteristic(Characteristic.PositionState, 2)
      cService = accessory.getService(Service.WindowCovering)
    }
    cService
      .getCharacteristic(Characteristic.TargetPosition)
      .on('set', (value, callback) => this.internalUpdate(accessory, value, callback))
  }

  async internalUpdate (accessory, value, callback) {
    callback()
    try {
      let params
      const cService = accessory.getService(Service.WindowCovering)
      const prevPos = accessory.context.cacheCurrentPosition
      const newPos = value
      if (newPos === prevPos) return
      if (newPos === 0 || newPos === 100) {
        params = {
          switch: newPos === 100 ? 'on' : 'off'
        }
      } else {
        params = {
          setclose: Math.abs(100 - newPos)
        }
      }
      await this.platform.sendDeviceUpdate(accessory, params)
      cService
        .updateCharacteristic(Characteristic.TargetPosition, newPos)
        .updateCharacteristic(Characteristic.PositionState, newPos > prevPos ? 1 : 0)
      accessory.context.cacheCurrentPosition = newPos
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {
      const cService = accessory.getService(Service.WindowCovering)
      if (!utils.hasProperty(params, 'switch') && !utils.hasProperty(params, 'setclose')) {
        return
      }
      const newPos = Math.abs(100 - parseInt(params.setclose))
      cService
        .updateCharacteristic(Characteristic.TargetPosition, newPos)
        .updateCharacteristic(Characteristic.CurrentPosition, newPos)
        .updateCharacteristic(Characteristic.PositionState, 2)
      accessory.context.cacheCurrentPosition = newPos
      return
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
