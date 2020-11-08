/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const helpers = require('./../helpers')
module.exports = class deviceLock {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    const lmService = accessory.getService(this.Service.LockMechanism) || accessory.addService(this.Service.LockMechanism)
    lmService
      .getCharacteristic(this.Characteristic.LockTargetState)
      .on('set', (value, callback) => this.internalUpdate(accessory, value, callback))
  }

  async internalUpdate (accessory, value, callback) {
    try {
      callback()
      let lockConfig
      const params = { switch: 'on' }
      const lmService = accessory.getService(this.Service.LockMechanism)
      if (!(lockConfig = this.platform.cusG.get(accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (lockConfig.type !== 'lock') {
        throw new Error('improper configuration')
      }
      accessory.context.inUse = true
      await this.platform.sendDeviceUpdate(accessory, params)
      await helpers.sleep(Math.max(lockConfig.operationTime * 100, 1000))
      lmService
        .updateCharacteristic(this.Characteristic.LockTargetState, 1)
        .updateCharacteristic(this.Characteristic.LockCurrentState, 1)
      accessory.context.inUse = false
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {
      if (!helpers.hasProperty(params, 'switch')) return
      let lockConfig
      const lmService = accessory.getService(this.Service.LockMechanism)
      if (!(lockConfig = this.platform.cusG.get(accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (lockConfig.type !== 'lock') {
        throw new Error('improper configuration')
      }
      if (params.switch === 'off' || accessory.context.inUse) {
        return
      }
      accessory.context.inUse = true
      lmService
        .updateCharacteristic(this.Characteristic.LockCurrentState, 0)
        .updateCharacteristic(this.Characteristic.LockTargetState, 0)
      await helpers.sleep(Math.max(lockConfig.operationTime * 100, 1000))
      lmService
        .updateCharacteristic(this.Characteristic.LockCurrentState, 1)
        .updateCharacteristic(this.Characteristic.LockTargetState, 1)
      accessory.context.inUse = false
    } catch (err) {
      accessory.context.inUse = false
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
