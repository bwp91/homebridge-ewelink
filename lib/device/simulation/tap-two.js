/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceTapTwo {
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
    this.disableDeviceLogging = deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

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
      tapService.getCharacteristic(this.hapChar.Active).onSet(async value => {
        await this.internalUpdate('Tap ' + v, value)
      })
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        type: deviceConf.type
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
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
      if (!this.disableDeviceLogging) {
        this.log(
          '[%s] current state [%s %].',
          this.name,
          tap,
          value === 1 ? 'running' : 'stopped'
        )
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      const tapService = this.accessory.getService(tap)
      setTimeout(() => {
        tapService.updateCharacteristic(this.hapChar.Active, value === 1 ? 0 : 1)
      }, 5000)
      throw new this.platform.api.hap.HapStatusError(-70402)
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
        if (params.updateSource && !this.disableDeviceLogging) {
          const logText = params.switches[k].switch === 'on' ? 'running' : 'stopped'
          this.log('[%s] current state [Tap %s running].', this.name, v, logText)
        }
      })
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
