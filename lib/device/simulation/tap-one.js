/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceTapOne {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.hapChar = platform.api.hap.Characteristic
    this.hapErr = platform.api.hap.HapStatusError
    this.hapServ = platform.api.hap.Service
    this.lang = platform.lang
    this.log = platform.log
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceConf = platform.simulations[accessory.context.eweDeviceId]
    this.setup = deviceConf.setup
    this.disableDeviceLogging = deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Check for a valid setup
    if (!platform.consts.allowed.setups.includes(this.setup)) {
      this.error = this.lang.simErrSetup
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
    if (platform.config.debug) {
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
        throw new Error(this.lang.invalidConfig + ' - ' + this.error)
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
      this.cacheState = value ? 'on' : 'off'
      this.service.updateCharacteristic(this.hapChar.InUse, value)
      if (!this.disableDeviceLogging) {
        this.log(
          '[%s] %s [%s].',
          this.name,
          this.lang.curState,
          value === 1 ? this.lang.valveYes : this.lang.valveNo
        )
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on')
      }, 5000)
      throw new this.hapErr(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.error) {
        throw new Error(this.lang.invalidConfig + ' - ' + this.error)
      }
      switch (this.setup) {
        case 'oneSwitch':
          if (!params.switch || params.switch === this.cacheState) {
            return
          }
          this.cacheState = params.switch
          break
        case 'twoSwitch':
          if (!params.switches || params.switches[0].switch === this.cacheState) {
            return
          }
          this.cacheState = params.switches[0].switch
          break
      }
      this.service.updateCharacteristic(
        this.hapChar.Active,
        this.cacheState === 'on' ? 1 : 0
      )
      this.service.updateCharacteristic(
        this.hapChar.InUse,
        this.cacheState === 'on' ? 1 : 0
      )
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log(
          '[%s] %s [%s].',
          this.name,
          this.lang.curState,
          this.cacheState === 'on' ? this.lang.valveYes : this.lang.valveNo
        )
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
