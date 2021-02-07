/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceLockOne {
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

    const asConfig = platform.simulations[this.accessory.context.eweDeviceId]
    if (!['oneSwitch', 'twoSwitch'].includes(asConfig.setup)) {
      this.error = 'setup must be oneSwitch or twoSwitch'
    }
    this.setup = asConfig.setup
    this.operationTime = parseInt(asConfig.operationTime)
    this.operationTime = isNaN(this.operationTime) || this.operationTime < 20
      ? this.consts.defaults.operationTime
      : this.operationTime

    this.service = this.accessory.getService(this.hapServ.LockMechanism) || this.accessory.addService(this.hapServ.LockMechanism)
    this.service.getCharacteristic(this.hapChar.LockTargetState)
      .on('set', this.internalUpdate.bind(this))
    this.service.updateCharacteristic(this.hapChar.LockCurrentState, 1)
      .updateCharacteristic(this.hapChar.LockTargetState, 1)
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      if (this.error) {
        this.log.warn('[%s] invalid config - %s.', this.name, this.error)
        return
      }
      const params = {}
      switch (this.setup) {
        case 'oneSwitch':
          params.switch = 'on'
          break
        case 'twoSwitch':
          params.switches = this.consts.defaultMultiSwitchOff
          params.switches[0].switch = 'on'
          break
      }
      this.inUse = true
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.service.setCharacteristic(this.hapChar.LockCurrentState, 0)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current status [unlocked].', this.name)
      }
      await this.funcs.sleep(Math.max(this.operationTime * 100, 1000))
      this.service.updateCharacteristic(this.hapChar.LockTargetState, 1)
      this.service.setCharacteristic(this.hapChar.LockCurrentState, 1)
      this.inUse = false
      if (!this.disableDeviceLogging) {
        this.log('[%s] current status [locked].', this.name)
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.error) {
        this.log.warn('[%s] invalid config - %s.', this.name, this.error)
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
      this.service.updateCharacteristic(this.hapChar.LockCurrentState, 0)
        .updateCharacteristic(this.hapChar.LockTargetState, 0)
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current status [unlocked].', this.name)
      }
      await this.funcs.sleep(Math.max(this.operationTime * 100, 1000))
      this.service.updateCharacteristic(this.hapChar.LockCurrentState, 1)
        .updateCharacteristic(this.hapChar.LockTargetState, 1)
      this.inUse = false
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current status [locked].', this.name)
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
