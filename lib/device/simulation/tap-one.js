/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceTapOne {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.log = platform.log
    this.lang = platform.lang
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.simulations[deviceId]
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

    // Add the tap service if it doesn't already exist
    if (!(this.service = this.accessory.getService(this.hapServ.Valve))) {
      this.service = this.accessory.addService(this.hapServ.Valve)
      this.service.setCharacteristic(this.hapChar.Active, 0)
      this.service.setCharacteristic(this.hapChar.InUse, 0)
      this.service.setCharacteristic(this.hapChar.ValveType, 3)
    }

    // Add the set handler to the tap active characteristic
    this.service.getCharacteristic(this.hapChar.Active).onSet(async value => {
      await this.internalUpdate(value)
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        setup: this.setup,
        type: deviceConf.type
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
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
          params.switch = value ? 'on' : 'off'
          break
        case 'twoSwitch':
          params.switches = [{
            switch: value ? 'on' : 'off',
            outlet: 0
          }]
          break
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheOnOff = value ? 'on' : 'off'
      this.service.updateCharacteristic(this.hapChar.InUse, value)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.Active, this.cacheOnOff === 'on')
      }, 5000)
      throw new this.platform.api.hap.HapStatusError(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.error) {
        throw new Error('invalid config - ' + this.error)
      }
      switch (this.setup) {
        case 'oneSwitch':
          if (!params.switch || params.switch === this.cacheOnOff) {
            return
          }
          this.cacheOnOff = params.switch
          break
        case 'twoSwitch':
          if (!params.switches || params.switches[0].switch === this.cacheOnOff) {
            return
          }
          this.cacheOnOff = params.switches[0].switch
          break
      }
      this.service
        .updateCharacteristic(this.hapChar.Active, this.cacheOnOff === 'on' ? 1 : 0)
        .updateCharacteristic(this.hapChar.InUse, this.cacheOnOff === 'on' ? 1 : 0)
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
