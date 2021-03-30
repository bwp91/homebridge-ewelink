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

    // Check for a valid setup
    if (!this.consts.allowed.setups.includes(this.setup)) {
      this.error = "device has not been set up as 'oneSwitch' or 'twoSwitch'"
    }

    // If the accessory has a switch service then remove it
    if (this.accessory.getService(this.hapServ.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
    }

    // Add the lock service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.LockMechanism) ||
      this.accessory.addService(this.hapServ.LockMechanism)

    // Add the set handler to the lock target state characteristic
    this.service.getCharacteristic(this.hapChar.LockTargetState).onSet(value => {
      // We don't use await as we want the callback to be run straight away
      this.internalUpdate(value)
    })

    // Always show the accessory as locked on Homebridge restart
    this.service.updateCharacteristic(this.hapChar.LockCurrentState, 1)
      .updateCharacteristic(this.hapChar.LockTargetState, 1)

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        operationTime: this.operationTime,
        setup: this.setup,
        type: deviceConf.type
      })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async internalUpdate (value) {
    try {
      if (this.error) {
        throw new Error('invalid config - ' + this.error)
      }
      const params = {}
      switch (this.setup) {
        case 'oneSwitch':
          params.switch = 'on'
          break
        case 'twoSwitch':
          params.switches = this.accessory.context.eweUIID === 126
            ? this.consts.defaultDoubleSwitchOff
            : this.consts.defaultMultiSwitchOff
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
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.LockTargetState, 1)
      }, 5000)
      this.service.updateCharacteristic(
        this.hapChar.LockTargetState,
        new this.platform.api.hap.HapStatusError(-70402)
      )
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
