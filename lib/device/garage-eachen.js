/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceGarageEachen {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    this.operationTime = parseInt(platform.cusG.get(accessory.context.eweDeviceId).operationTime)
    this.operationTime = isNaN(this.operationTime)
      ? this.helpers.defaults.operationTime
      : this.operationTime < 20
        ? this.helpers.defaults.operationTime
        : this.operationTime
    if (!(this.service = accessory.getService(this.S.GarageDoorOpener))) {
      this.service = accessory.addService(this.S.GarageDoorOpener)
      this.service.setCharacteristic(this.C.CurrentDoorState, 1)
        .setCharacteristic(this.C.TargetDoorState, 1)
        .setCharacteristic(this.C.ObstructionDetected, false)
    }
    this.service.getCharacteristic(this.C.TargetDoorState)
      .on('set', this.internalUpdate.bind(this))
    this.service.updateCharacteristic(this.C.ObstructionDetected, false)
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      const params = { switch: value === 0 ? 'on' : 'off' }
      if (value === this.service.getCharacteristic(this.C.CurrentDoorState).value % 2) {
        return
      }
      this.inUse = true
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.service.updateCharacteristic(this.C.TargetDoorState, value)
        .updateCharacteristic(this.C.CurrentDoorState, value + 2)
      await this.helpers.sleep(2000)
      this.inUse = false
      if (value === 0) {
        await this.helpers.sleep(Math.max((this.operationTime - 20) * 100, 0))
        this.service.updateCharacteristic(this.C.CurrentDoorState, 0)
        if (!this.disableDeviceLogging) {
          this.log('[%s] current state [open].', this.accessory.displayName)
        }
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switch || this.inUse) {
        return
      }
      this.service.updateCharacteristic(this.C.TargetDoorState, params.switch === 'on' ? 0 : 1)
        .updateCharacteristic(this.C.CurrentDoorState, params.switch === 'on' ? 0 : 1)
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.accessory.displayName, params.switch === 'on' ? 'open' : 'closed')
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
