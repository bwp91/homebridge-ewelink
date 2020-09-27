'use strict'
let Characteristic, Service
const utils = require('./../utils')
module.exports = class deviceLock {
  constructor (platform) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
  }

  async internalLockUpdate (accessory, value, callback) {
    callback()
    try {
      let lockConfig
      const params = {
        switch: 'on'
      }
      const lmService = accessory.getService(Service.LockMechanism)
      if (!(lockConfig = this.platform.cusG.get(accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (lockConfig.type !== 'lock') {
        throw new Error('improper configuration')
      }
      accessory.context.inUse = true
      await this.platform.sendDeviceUpdate(accessory, params)
      lmService
        .updateCharacteristic(Characteristic.LockTargetState, 0)
        .updateCharacteristic(Characteristic.LockCurrentState, 0)
      await utils.sleep(lockConfig.operationTime * 100)
      lmService
        .updateCharacteristic(Characteristic.LockTargetState, 1)
        .updateCharacteristic(Characteristic.LockCurrentState, 1)
      accessory.context.inUse = false
    } catch (err) {
      this.platform.requestDeviceRefresh(accessory, err)
    }
  }

  externalLockUpdate (accessory, params) {
    try {
      let lockConfig
      const lmService = accessory.getService(Service.LockMechanism)
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
        .updateCharacteristic(Characteristic.LockCurrentState, 0)
        .updateCharacteristic(Characteristic.LockTargetState, 0)
      setTimeout(() => {
        lmService
          .updateCharacteristic(Characteristic.LockCurrentState, 1)
          .updateCharacteristic(Characteristic.LockTargetState, 1)
        accessory.context.inUse = false
      }, parseInt(lockConfig.operationTime) * 100)
    } catch (err) {
      accessory.context.inUse = false
      this.platform.log.warn('[%s] could not be updated as %s.', accessory.displayName, err)
    }
  }
}
