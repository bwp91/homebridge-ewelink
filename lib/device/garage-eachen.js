/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const helpers = require('./../helpers')
module.exports = class deviceGarageEachen {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    let gdeService
    if (!(gdeService = accessory.getService(this.Service.GarageDoorOpener))) {
      accessory
        .addService(this.Service.GarageDoorOpener)
        .setCharacteristic(this.Characteristic.CurrentDoorState, 1)
        .setCharacteristic(this.Characteristic.TargetDoorState, 1)
        .setCharacteristic(this.Characteristic.ObstructionDetected, false)
      gdeService = accessory.getService(this.Service.GarageDoorOpener)
    }
    gdeService
      .getCharacteristic(this.Characteristic.TargetDoorState)
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
      const gdService = accessory.getService(this.Service.GarageDoorOpener)
      if (value === gdService.getCharacteristic(this.Characteristic.CurrentDoorState).value % 2) return
      accessory.context.inUse = true
      await this.platform.sendDeviceUpdate(accessory, params)
      gdService
        .updateCharacteristic(this.Characteristic.TargetDoorState, value)
        .updateCharacteristic(this.Characteristic.CurrentDoorState, value + 2)
      await helpers.sleep(2000)
      accessory.context.inUse = false
      if (value === 0) {
        await helpers.sleep(Math.max((garageConfig.operationTime - 20) * 100, 0))
        gdService.updateCharacteristic(this.Characteristic.CurrentDoorState, 0)
      }
    } catch (err) {
      accessory.context.inUse = false
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {
      if (!helpers.hasProperty(params, 'switch') || accessory.context.inUse) return
      let garageConfig
      if (!(garageConfig = this.platform.cusG.get(accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (garageConfig.type !== 'garage_eachen') {
        throw new Error('improper configuration')
      }
      accessory.context.inUse = true
      const gdService = accessory.getService(this.Service.GarageDoorOpener)
      gdService
        .updateCharacteristic(this.Characteristic.TargetDoorState, params.switch === 'on' ? 0 : 1)
        .updateCharacteristic(this.Characteristic.CurrentDoorState, params.switch === 'on' ? 0 : 1)
      accessory.context.inUse = false
    } catch (err) {
      accessory.context.inUse = false
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
