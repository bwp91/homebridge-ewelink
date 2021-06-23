/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceTapTwo {
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

    // Initially set the online flag as true (to be then updated as false if necessary)
    this.isOnline = true

    // Set up custom variables for this device type
    const deviceConf = platform.simulations[accessory.context.eweDeviceId]

    // Set the correct logging variables for this accessory
    this.enableLogging = !platform.config.disableDeviceLogging
    this.enableDebugLogging = platform.config.debug
    if (deviceConf && deviceConf.overrideLogging) {
      switch (deviceConf.overrideLogging) {
        case 'standard':
          this.enableLogging = true
          this.enableDebugLogging = false
          break
        case 'debug':
          this.enableLogging = true
          this.enableDebugLogging = true
          break
        case 'disable':
          this.enableLogging = false
          this.enableDebugLogging = false
          break
      }
    }

    // We want two tap services for this accessory
    ;['A', 'B'].forEach(v => {
      // Add the tap service if it doesn't already exist
      let tapService
      if (!(tapService = this.accessory.getService(this.hapServ.Valve))) {
        tapService = this.accessory.addService(this.hapServ.Valve)
        tapService.setCharacteristic(this.hapChar.Active, 0)
        tapService.setCharacteristic(this.hapChar.InUse, 0)
        tapService.setCharacteristic(this.hapChar.ValveType, 3)
      }

      // Add the set handler to the tap active characteristic
      tapService
        .getCharacteristic(this.hapChar.Active)
        .onGet(() => {
          if (!this.isOnline && platform.config.offlineAsNoResponse) {
            throw new this.hapErr(-70402)
          }
          return tapService.getCharacteristic(this.hapChar.Active).value
        })
        .onSet(async value => await this.internalUpdate('Tap ' + v, value))
    })

    // Output the customised options to the log
    const opts = JSON.stringify({
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable',
      type: deviceConf.type
    })
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
  }

  async internalUpdate (tap, value) {
    try {
      const params = {
        switches: []
      }
      const tapService = this.accessory.getService(tap)
      switch (tap) {
        case 'Tap A':
          params.switches.push({ switch: value ? 'on' : 'off', outlet: 0 })
          break
        case 'Tap B':
          params.switches.push({ switch: value ? 'on' : 'off', outlet: 1 })
          break
      }
      tapService.updateCharacteristic(this.hapChar.InUse, value)
      if (this.enableLogging) {
        this.log(
          '[%s] %s [%s %s].',
          this.name,
          this.lang.curState,
          tap,
          value === 1 ? this.lang.valveYes : this.lang.valveNo
        )
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      const tapService = this.accessory.getService(tap)
      setTimeout(() => {
        tapService.updateCharacteristic(this.hapChar.Active, value === 1 ? 0 : 1)
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switches) {
        return
      }
      ;['A', 'B'].forEach((v, k) => {
        const tapService = this.accessory.getService('Valve ' + v)
        tapService.updateCharacteristic(
          this.hapChar.Active,
          params.switches[k].switch === 'on' ? 1 : 0
        )
        tapService.updateCharacteristic(
          this.hapChar.InUse,
          params.switches[k].switch === 'on' ? 1 : 0
        )
        if (params.updateSource && this.enableLogging) {
          this.log(
            '[%s] %s [Tap %s %s].',
            this.name,
            this.lang.curState,
            v,
            params.switches[k].switch === 'on' ? this.lang.valveYes : this.lang.valveNo
          )
        }
      })
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
