/* jshint -W014, -W033, esversion: 9 */
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
      const params = { switch: value === 0 ? 'on' : 'off' }
      const gdService = accessory.getService(Service.GarageDoorOpener)
      if (value === gdService.getCharacteristic(Characteristic.CurrentDoorState).value % 2) return
      accessory.context.inUse = true
      await this.platform.sendDeviceUpdate(accessory, params)
      gdService
        .updateCharacteristic(Characteristic.TargetDoorState, value)
        .updateCharacteristic(Characteristic.CurrentDoorState, value + 2)
      await utils.sleep(2000)
      accessory.context.inUse = false
      if (value === 0) {
        await utils.sleep(Math.max((garageConfig.operationTime - 20) * 100, 0))
        gdService.updateCharacteristic(Characteristic.CurrentDoorState, 0)
      }
    } catch (err) {
      accessory.context.inUse = false
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {
      if (!utils.hasProperty(params, 'switch') || accessory.context.inUse) {
        return
      }
      let garageConfig
      if (!(garageConfig = this.platform.cusG.get(accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (garageConfig.type !== 'garage_eachen') {
        throw new Error('improper configuration')
      }
      accessory.context.inUse = true
      const gdService = accessory.getService(Service.GarageDoorOpener)
      gdService
        .updateCharacteristic(Characteristic.TargetDoorState, params.switch === 'on' ? 0 : 1)
        .updateCharacteristic(Characteristic.CurrentDoorState, params.switch === 'on' ? 0 : 1)
      accessory.context.inUse = false
    } catch (err) {
      accessory.context.inUse = false
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
