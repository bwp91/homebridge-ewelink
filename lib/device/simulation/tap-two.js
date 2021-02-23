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
    this.messages = platform.messages
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
          .setCharacteristic(this.hapChar.InUse, 0)
          .setCharacteristic(this.hapChar.ValveType, 3)
      }

      // Add the set handler to the tap active characteristic
      tapService.getCharacteristic(this.hapChar.Active)
        .on('set', (value, callback) => this.internalUpdate('Tap ' + v, value, callback))
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({ disableDeviceLogging: this.disableDeviceLogging })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async internalUpdate (tap, value, callback) {
    try {
      callback()
      const params = { switches: this.consts.defaultMultiSwitchOff }
      const tapService = this.accessory.getService(tap)
      switch (tap) {
        case 'Tap A': {
          const bValue = this.accessory.getService('Tap B')
            .getCharacteristic(this.hapChar.Active).value
          params.switches[0].switch = value ? 'on' : 'off'
          params.switches[1].switch = bValue === 1 ? 'on' : 'off'
          break
        }
        case 'Tap B': {
          const aValue = this.accessory.getService('Tap A')
            .getCharacteristic(this.hapChar.Active).value === 1
          params.switches[0].switch = aValue ? 'on' : 'off'
          params.switches[1].switch = value ? 'on' : 'off'
          break
        }
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
