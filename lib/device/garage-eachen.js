'use strict'
let Characteristic, Service
const utils = require('./../utils')
module.exports = class deviceGarageEachen {
  constructor (platform, accessory) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
    let gdeService
    if (!(gdeService = accessory.getService(Service.GarageDoorOpener))) {
      accessory
        .addService(Service.GarageDoorOpener)
        .setCharacteristic(Characteristic.CurrentDoorState, 1)
        .setCharacteristic(Characteristic.TargetDoorState, 1)
        .setCharacteristic(Characteristic.ObstructionDetected, false)
      gdeService = accessory.getService(Service.GarageDoorOpener)
    }
    gdeService
      .getCharacteristic(Characteristic.TargetDoorState)
      .on('set', (value, callback) => this.internalUpdate(accessory, value, callback))
    accessory.context.ignoreNextOffUpdate = false
    accessory.context.ignoreNextOnUpdate = false
  }

  async internalUpdate (accessory, value, callback) {
    callback()
    try {
      let garageConfig
      if (!(garageConfig = this.platform.cusG.get(accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (garageConfig.type !== 'garage_eachen') {
        throw new Error('improper configuration')
      }
      const params = {}
      const newPos = value
      const gdService = accessory.getService(Service.GarageDoorOpener)
      const prevState = gdService.getCharacteristic(Characteristic.CurrentDoorState).value
      if (newPos === prevState % 2) return
      gdService
        .updateCharacteristic(Characteristic.TargetDoorState, newPos)
        .updateCharacteristic(Characteristic.CurrentDoorState, newPos + 2)
      params.switch = value === 0 ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(accessory, params)
      if (newPos === 1) {
        // garage door to close
        accessory.context.ignoreNextOffUpdate = true
        accessory.context.ignoreNextOnUpdate = true
      }
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {
      if (!utils.hasProperty(params, 'switch')) {
        return
      }
      let garageConfig
      if (!(garageConfig = this.platform.cusG.get(accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (garageConfig.type !== 'garage_eachen') {
        throw new Error('improper configuration')
      }
      const gdService = accessory.getService(Service.GarageDoorOpener)

      if (params.switch === 'off' && accessory.context.ignoreNextOffUpdate) {
        accessory.context.ignoreNextOffUpdate = false
        return
      }
      if (params.switch === 'on' && accessory.context.ignoreNextOnUpdate) {
        accessory.context.ignoreNextOnUpdate = false
        return
      }

      gdService.updateCharacteristic(Characteristic.TargetDoorState, params.switch === 'on' ? 0 : 1)
      if (params.switch === 'on') {
        await utils.sleep(garageConfig.operationTime * 100)
      }
      gdService.updateCharacteristic(Characteristic.CurrentDoorState, params.switch === 'on' ? 0 : 1)
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
