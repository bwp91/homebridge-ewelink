/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceValveOne {
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
      this.error = this.lang.simErrSetup
    }

    // If the accessory has a switch service then remove it
    if (this.accessory.getService(this.hapServ.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
    }

    // Add the valve service if it doesn't already exist
    if (!(this.service = this.accessory.getService(this.hapServ.Valve))) {
      this.service = this.accessory.addService(this.hapServ.Valve)
      this.service.setCharacteristic(this.hapChar.Active, 0)
      this.service.setCharacteristic(this.hapChar.InUse, 0)
      this.service.setCharacteristic(this.hapChar.ValveType, 1)
      this.service.setCharacteristic(this.hapChar.SetDuration, 120)
      this.service.addCharacteristic(this.hapChar.RemainingDuration)
    }

    // Add the set handler to the valve active characteristic
    this.service.getCharacteristic(this.hapChar.Active).onSet(async value => {
      await this.internalUpdate(value)
    })

    // Add the set handler to the valve set duration characteristic
    this.service.getCharacteristic(this.hapChar.SetDuration).onSet(value => {
      // Check if the valve is currently active
      if (this.service.getCharacteristic(this.hapChar.InUse).value === 1) {
        // Update the remaining duration characteristic with the new value
        this.service.updateCharacteristic(this.hapChar.RemainingDuration, value)

        // Clear any existing active timers
        clearTimeout(this.timer)

        // Set a new active timer with the new time amount
        this.timer = setTimeout(
          () => this.service.setCharacteristic(this.hapChar.Active, 0),
          value * 1000
        )
      }
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
      this.service.updateCharacteristic(this.hapChar.InUse, value)
      switch (value) {
        case 0:
          this.service.updateCharacteristic(this.hapChar.RemainingDuration, 0)
          clearTimeout(this.timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] %s [%s].', this.name, this.lang.curState, this.lang.valveNo)
          }
          break
        case 1: {
          const timer = this.service.getCharacteristic(this.hapChar.SetDuration).value
          this.service.updateCharacteristic(this.hapChar.RemainingDuration, timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] %s [%s].', this.name, this.lang.curState, this.lang.valveYes)
          }
          this.timer = setTimeout(() => {
            this.service.setCharacteristic(this.hapChar.Active, 0)
          }, timer * 1000)
          break
        }
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.Active, value === 1 ? 0 : 1)
      }, 5000)
      throw new this.platform.api.hap.HapStatusError(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.error) {
        throw new Error(this.lang.invalidConfig + ' - ' + this.error)
      }
      let isOn = false
      switch (this.setup) {
        case 'oneSwitch':
          if (!params.switch) {
            return
          }
          isOn = params.switch === 'on'
          break
        case 'twoSwitch':
          if (!params.switches) {
            return
          }
          isOn = params.switches[0].switch === 'on'
          break
      }
      if (isOn) {
        if (this.service.getCharacteristic(this.hapChar.Active).value === 0) {
          const timer = this.service.getCharacteristic(this.hapChar.SetDuration).value
          this.service.updateCharacteristic(this.hapChar.Active, 1)
            .updateCharacteristic(this.hapChar.InUse, 1)
            .updateCharacteristic(this.hapChar.RemainingDuration, timer)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] %s [%s].', this.name, this.lang.curState, this.lang.valveYes)
          }
          this.timer = setTimeout(() => {
            this.service.setCharacteristic(this.hapChar.Active, 0)
          }, timer * 1000)
        }
        return
      }
      this.service.updateCharacteristic(this.hapChar.Active, 0)
        .updateCharacteristic(this.hapChar.InUse, 0)
        .updateCharacteristic(this.hapChar.RemainingDuration, 0)
      clearTimeout(this.timer)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
