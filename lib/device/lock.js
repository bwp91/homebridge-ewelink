/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceLock {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.lmService = accessory.getService(this.Service.LockMechanism) || accessory.addService(this.Service.LockMechanism)
    this.lmService
      .getCharacteristic(this.Characteristic.LockTargetState)
      .on('set', this.internalUpdate.bind(this))
    this.lmService
      .updateCharacteristic(this.Characteristic.LockCurrentState, 1)
      .updateCharacteristic(this.Characteristic.LockTargetState, 1)
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      const lockConfig = this.platform.cusG.get(this.accessory.context.hbDeviceId)
      const params = { switch: 'on' }
      this.inUse = true
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.log('[%s] current status [unlocked].', this.accessory.displayName)
      await this.helpers.sleep(Math.max(lockConfig.operationTime * 100, 1000))
      this.lmService
        .updateCharacteristic(this.Characteristic.LockTargetState, 1)
        .updateCharacteristic(this.Characteristic.LockCurrentState, 1)
      this.inUse = false
      this.log('[%s] current status [locked].', this.accessory.displayName)
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switch || params.switch === 'off' || this.inUse) return
      const lockConfig = this.platform.cusG.get(this.accessory.context.hbDeviceId)
      this.inUse = true
      this.lmService
        .updateCharacteristic(this.Characteristic.LockCurrentState, 0)
        .updateCharacteristic(this.Characteristic.LockTargetState, 0)
      this.log('[%s] current status [unlocked].', this.accessory.displayName)
      await this.helpers.sleep(Math.max(lockConfig.operationTime * 100, 1000))
      this.lmService
        .updateCharacteristic(this.Characteristic.LockCurrentState, 1)
        .updateCharacteristic(this.Characteristic.LockTargetState, 1)
      this.inUse = false
      this.log('[%s] current status [locked].', this.accessory.displayName)
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
