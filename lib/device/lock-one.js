/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceLockOne {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    this.dName = accessory.displayName
    this.accessory = accessory

    const asConfig = platform.cusG.get(this.accessory.context.eweDeviceId)
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

    this.service = this.accessory.getService(this.S.LockMechanism) || this.accessory.addService(this.S.LockMechanism)
    this.service.getCharacteristic(this.C.LockTargetState)
      .on('set', this.internalUpdate.bind(this))
    this.service.updateCharacteristic(this.C.LockCurrentState, 1)
      .updateCharacteristic(this.C.LockTargetState, 1)
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      if (this.error) {
        this.log.warn('[%s] invalid config - %s.', this.dName, this.error)
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
        this.log('[%s] current status [unlocked].', this.dName)
      }
      await this.helpers.sleep(Math.max(this.operationTime * 100, 1000))
      this.service.updateCharacteristic(this.C.LockTargetState, 1)
        .updateCharacteristic(this.C.LockCurrentState, 1)
      this.inUse = false
      if (!this.disableDeviceLogging) {
        this.log('[%s] current status [locked].', this.dName)
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.error) {
        this.log.warn('[%s] invalid config - %s.', this.dName, this.error)
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
      this.service.updateCharacteristic(this.C.LockCurrentState, 0)
        .updateCharacteristic(this.C.LockTargetState, 0)
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current status [unlocked].', this.dName)
      }
      await this.helpers.sleep(Math.max(this.operationTime * 100, 1000))
      this.service.updateCharacteristic(this.C.LockCurrentState, 1)
        .updateCharacteristic(this.C.LockTargetState, 1)
      this.inUse = false
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current status [locked].', this.dName)
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
