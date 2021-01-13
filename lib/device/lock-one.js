/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceLockOne {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    const asConfig = platform.cusG.get(accessory.context.eweDeviceId)
    if (!['oneSwitch', 'twoSwitch'].includes(asConfig.setup)) {
      this.error = 'setup must be oneSwitch or twoSwitch'
    }
    this.setup = asConfig.setup
    this.operationTime = parseInt(asConfig.operationTime)
    this.operationTime = isNaN(this.operationTime)
      ? this.helpers.defaults.operationTime
      : this.operationTime < 20
        ? this.helpers.defaults.operationTime
        : this.operationTime
    this.service = accessory.getService(this.Service.LockMechanism) || accessory.addService(this.Service.LockMechanism)
    this.service.getCharacteristic(this.Characteristic.LockTargetState)
      .on('set', this.internalUpdate.bind(this))
    this.service.updateCharacteristic(this.Characteristic.LockCurrentState, 1)
      .updateCharacteristic(this.Characteristic.LockTargetState, 1)
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      if (this.error) {
        this.log.warn('[%s] invalid config - %s.', this.accessory.displayName, this.error)
        return
      }
      const params = {}
      switch (this.setup) {
        case 'oneSwitch':
          params.switch = 'on'
          break
        case 'twoSwitch':
          params.switches = this.helpers.defaultMultiSwitchOff
          params.switches[0].switch = 'on'
          break
      }
      this.inUse = true
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current status [unlocked].', this.accessory.displayName)
      }
      await this.helpers.sleep(Math.max(this.operationTime * 100, 1000))
      this.service.updateCharacteristic(this.Characteristic.LockTargetState, 1)
        .updateCharacteristic(this.Characteristic.LockCurrentState, 1)
      this.inUse = false
      if (!this.disableDeviceLogging) {
        this.log('[%s] current status [locked].', this.accessory.displayName)
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.error) {
        this.log.warn('[%s] invalid config - %s.', this.accessory.displayName, this.error)
        return
      }
      if (this.inUse) {
        return
      }
      switch (this.setup) {
        case 'oneSwitch':
          if (!params.switch || params.switch === 'off') {
            return
          }
          break
        case 'twoSwitch':
          if (!params.switches || params.switches[0].switch === 'off') {
            return
          }
          break
      }
      this.inUse = true
      this.service.updateCharacteristic(this.Characteristic.LockCurrentState, 0)
        .updateCharacteristic(this.Characteristic.LockTargetState, 0)
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current status [unlocked].', this.accessory.displayName)
      }
      await this.helpers.sleep(Math.max(this.operationTime * 100, 1000))
      this.service.updateCharacteristic(this.Characteristic.LockCurrentState, 1)
        .updateCharacteristic(this.Characteristic.LockTargetState, 1)
      this.inUse = false
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current status [locked].', this.accessory.displayName)
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
