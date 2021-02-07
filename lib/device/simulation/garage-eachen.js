/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceGarageEachen {
  constructor (platform, accessory) {
    this.platform = platform
    this.funcs = platform.funcs
    this.messages = platform.messages
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.name = accessory.displayName
    this.accessory = accessory

    this.operationTime = parseInt(platform.simulations[this.accessory.context.eweDeviceId].operationTime)
    this.operationTime = isNaN(this.operationTime) || this.operationTime < 20
      ? this.consts.defaults.operationTime
      : this.operationTime

    if (!(this.service = this.accessory.getService(this.hapServ.GarageDoorOpener))) {
      this.service = this.accessory.addService(this.hapServ.GarageDoorOpener)
      this.service.setCharacteristic(this.hapChar.CurrentDoorState, 1)
        .setCharacteristic(this.hapChar.TargetDoorState, 1)
        .setCharacteristic(this.hapChar.ObstructionDetected, false)
    }
    this.service.getCharacteristic(this.hapChar.TargetDoorState)
      .on('set', this.internalUpdate.bind(this))
    this.service.updateCharacteristic(this.hapChar.ObstructionDetected, false)
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      const params = { switch: value === 0 ? 'on' : 'off' }
      if (value === this.service.getCharacteristic(this.hapChar.CurrentDoorState).value % 2) {
        return
      }
      this.inUse = true
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.service.updateCharacteristic(this.hapChar.TargetDoorState, value)
        .updateCharacteristic(this.hapChar.CurrentDoorState, value + 2)
      await this.funcs.sleep(2000)
      this.inUse = false
      if (value === 0) {
        await this.funcs.sleep(Math.max((this.operationTime - 20) * 100, 0))
        this.service.updateCharacteristic(this.hapChar.CurrentDoorState, 0)
        if (!this.disableDeviceLogging) {
          this.log('[%s] current state [open].', this.name)
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
      this.service.updateCharacteristic(this.hapChar.TargetDoorState, params.switch === 'on' ? 0 : 1)
        .updateCharacteristic(this.hapChar.CurrentDoorState, params.switch === 'on' ? 0 : 1)
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, params.switch === 'on' ? 'open' : 'closed')
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
