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
    this.messages = platform.messages
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

    // Add the valve service if it doesn't already exist
    if (!(this.service = this.accessory.getService(this.hapServ.Valve))) {
      this.service = this.accessory.addService(this.hapServ.Valve)
      this.service.setCharacteristic(this.hapChar.Active, 0)
        .setCharacteristic(this.hapChar.InUse, 0)
        .setCharacteristic(this.hapChar.ValveType, 1)
        .setCharacteristic(this.hapChar.SetDuration, 120)
        .addCharacteristic(this.hapChar.RemainingDuration)
    }

    // Add the set handler to the valve active characteristic
    this.service.getCharacteristic(this.hapChar.Active)
      .on('set', this.internalUpdate.bind(this))

    // Add the set handler to the valve set duration characteristic
    this.service.getCharacteristic(this.hapChar.SetDuration)
      .on('set', (value, callback) => {
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
        callback()
      })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
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
          params.switch = value ? 'on' : 'off'
          break
        case 'twoSwitch':
          params.switches = this.consts.defaultMultiSwitchOff
          params.switches[0].switch = value ? 'on' : 'off'
          break
      }
      this.service.updateCharacteristic(this.hapChar.InUse, value)
      switch (value) {
        case 0:
          this.service.updateCharacteristic(this.hapChar.RemainingDuration, 0)
          clearTimeout(this.timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [stopped].', this.name)
          }
          break
        case 1: {
          const timer = this.service.getCharacteristic(this.hapChar.SetDuration).value
          this.service.updateCharacteristic(this.hapChar.RemainingDuration, timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [running].', this.name)
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
    }
  }

  async externalUpdate (params) {
    try {
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
            this.log('[%s] current state [running].', this.name)
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
