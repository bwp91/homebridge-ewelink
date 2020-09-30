'use strict'
let Characteristic, Service
const utils = require('./../utils')
module.exports = class deviceGarageEachen {
  constructor (platform) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
  }

  async internalGarageEachenUpdate (accessory, value, callback) {
    callback()
    try {
      let garageConfig
      if (!(garageConfig = this.platform.cusG.get(accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      const params = {}
      const newPos = value
      const gdService = accessory.getService(Service.GarageDoorOpener)
      const prevState = gdService.getCharacteristic(Characteristic.CurrentDoorState).value
      if (newPos === prevState % 2) return
      accessory.context.inUse = true
      gdService
        .updateCharacteristic(Characteristic.TargetDoorState, newPos)
        .updateCharacteristic(Characteristic.CurrentDoorState, newPos + 2)
      params.switch = value === 0 ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(accessory, params)
      await utils.sleep(garageConfig.operationTime * 100)
      gdService.updateCharacteristic(Characteristic.CurrentDoorState, newPos)
      accessory.context.inUse = false
    } catch (err) {
      accessory.context.inUse = false
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  externalGarageEachenUpdate (accessory, params) {
    try {
      if (!Object.prototype.hasOwnProperty.call(params, 'switch') || accessory.context.inUse) {
        return
      }
      const gdService = accessory.getService(Service.GarageDoorOpener)
      gdService.updateCharacteristic(Characteristic.CurrentDoorState, params.switch === 'on' ? 0 : 1)
      gdService.updateCharacteristic(Characteristic.TargetDoorState, params.switch === 'on' ? 0 : 1)
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
