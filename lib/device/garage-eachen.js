/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceGarageEachen {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    if (!(this.gdService = accessory.getService(this.Service.GarageDoorOpener))) {
      this.gdService = accessory.addService(this.Service.GarageDoorOpener)
      this.gdService
        .setCharacteristic(this.Characteristic.CurrentDoorState, 1)
        .setCharacteristic(this.Characteristic.TargetDoorState, 1)
        .setCharacteristic(this.Characteristic.ObstructionDetected, false)
    }
    this.gdService
      .getCharacteristic(this.Characteristic.TargetDoorState)
      .on('set', this.internalUpdate.bind(this))
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      const garageConfig = this.platform.cusG.get(this.accessory.context.hbDeviceId)
      const params = { switch: value === 0 ? 'on' : 'off' }
      if (value === this.gdService.getCharacteristic(this.Characteristic.CurrentDoorState).value % 2) return
      this.inUse = true
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.gdService
        .updateCharacteristic(this.Characteristic.TargetDoorState, value)
        .updateCharacteristic(this.Characteristic.CurrentDoorState, value + 2)
      await this.helpers.sleep(2000)
      this.inUse = false
      if (value === 0) {
        await this.helpers.sleep(Math.max((garageConfig.operationTime - 20) * 100, 0))
        this.gdService.updateCharacteristic(this.Characteristic.CurrentDoorState, 0)
        this.log('[%s] current state [open].', this.accessory.displayName)
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switch || this.inUse) return
      this.gdService
        .updateCharacteristic(this.Characteristic.TargetDoorState, params.switch === 'on' ? 0 : 1)
        .updateCharacteristic(this.Characteristic.CurrentDoorState, params.switch === 'on' ? 0 : 1)
      if (params.updateSource) {
        this.log('[%s] current state [%s].', this.accessory.displayName, params.switch === 'on' ? 'open' : 'closed')
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
