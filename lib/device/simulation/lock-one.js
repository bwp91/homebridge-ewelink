/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceLockOne {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.simulations[deviceId]
    this.operationTime = deviceConf.operationTime ||
      this.consts.defaultValues.operationTime
    this.setup = deviceConf.setup
    this.disableDeviceLogging = deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Add the lock service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.LockMechanism) ||
      this.accessory.addService(this.hapServ.LockMechanism)

    // Add the set handler to the lock target state characteristic
    this.service.getCharacteristic(this.hapChar.LockTargetState)
      .on('set', this.internalUpdate.bind(this))

    // Always show the accessory as locked on Homebridge restart
    this.service.updateCharacteristic(this.hapChar.LockCurrentState, 1)
      .updateCharacteristic(this.hapChar.LockTargetState, 1)

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        operationTime: this.operationTime,
        setup: this.setup
      })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async internalUpdate (value, callback) {
    try {
      callback()
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
