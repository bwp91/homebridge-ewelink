'use strict'
let Characteristic, Service
module.exports = class deviceCurtain {
  constructor (platform) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
  }

  async internalCurtainUpdate (accessory, value, callback) {
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
      this.platform.requestDeviceRefresh(accessory, err)
    }
  }

  externalCurtainUpdate (accessory, params) {
    try {
      const cService = accessory.getService(Service.WindowCovering)
      if (Object.prototype.hasOwnProperty.call(params, 'switch') && Object.prototype.hasOwnProperty.call(params, 'setclose')) {
        const newPos = Math.abs(100 - parseInt(params.setclose))
        cService
          .updateCharacteristic(Characteristic.TargetPosition, newPos)
          .updateCharacteristic(Characteristic.CurrentPosition, newPos)
          .updateCharacteristic(Characteristic.PositionState, 2)
        accessory.context.cacheCurrentPosition = newPos
        return
      }
    } catch (err) {
      this.platform.log.warn('[%s] could not be updated as %s.', accessory.displayName, err)
    }
  }
}
