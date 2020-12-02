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
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      let lockConfig
      const params = { switch: 'on' }
      if (!(lockConfig = this.platform.cusG.get(this.accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (lockConfig.type !== 'lock') {
        throw new Error('improper configuration')
      }
      this.accessory.context.inUse = true
      await this.platform.sendDeviceUpdate(this.accessory, params)
      await this.helpers.sleep(Math.max(lockConfig.operationTime * 100, 1000))
      this.lmService
        .updateCharacteristic(this.Characteristic.LockTargetState, 1)
        .updateCharacteristic(this.Characteristic.LockCurrentState, 1)
      this.accessory.context.inUse = false
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!this.helpers.hasProperty(params, 'switch')) return
      let lockConfig
      if (!(lockConfig = this.platform.cusG.get(this.accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (lockConfig.type !== 'lock') {
        throw new Error('improper configuration')
      }
      if (params.switch === 'off' || this.accessory.context.inUse) {
        return
      }
      this.accessory.context.inUse = true
      this.lmService
        .updateCharacteristic(this.Characteristic.LockCurrentState, 0)
        .updateCharacteristic(this.Characteristic.LockTargetState, 0)
      await this.helpers.sleep(Math.max(lockConfig.operationTime * 100, 1000))
      this.lmService
        .updateCharacteristic(this.Characteristic.LockCurrentState, 1)
        .updateCharacteristic(this.Characteristic.LockTargetState, 1)
      this.accessory.context.inUse = false
    } catch (err) {
      this.accessory.context.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
