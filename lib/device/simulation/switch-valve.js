/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSwitchValve {
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

    // Add the switch service if it doesn't already exist
    this.sService = this.accessory.getService(this.hapServ.Switch) ||
      this.accessory.addService(this.hapServ.Switch)

    // Add the valve service if it doesn't already exist
    if (!(this.vService = this.accessory.getService(this.hapServ.Valve))) {
      this.vService = this.accessory.addService(this.hapServ.Valve)
      this.vService.setCharacteristic(this.hapChar.Active, 0)
        .setCharacteristic(this.hapChar.InUse, 0)
        .setCharacteristic(this.hapChar.ValveType, 1)
        .setCharacteristic(this.hapChar.SetDuration, 120)
        .addCharacteristic(this.hapChar.RemainingDuration)
    }

    // Add the set handler to the switch on/off characteristic
    this.sService.getCharacteristic(this.hapChar.On)
      .on('set', this.internalSwitchUpdate.bind(this))

    // Add the set handler to the valve active characteristic
    this.vService.getCharacteristic(this.hapChar.Active)
      .on('set', this.internalValveUpdate.bind(this))

    // Add the set handler to the valve set duration characteristic
    this.vService.getCharacteristic(this.hapChar.SetDuration)
      .on('set', (value, callback) => {
        // Check if the valve is currently active
        if (this.vService.getCharacteristic(this.hapChar.InUse).value === 1) {
          // Update the remaining duration characteristic with the new value
          this.vService.updateCharacteristic(this.hapChar.RemainingDuration, value)

          // Clear any existing active timers
          clearTimeout(this.timer)

          // Set a new active timer with the new time amount
          this.timer = setTimeout(
            () => this.vService.setCharacteristic(this.hapChar.Active, 0),
            value * 1000
          )
        }
        callback()
      })

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('switch', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        type: deviceConf.type
      })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async internalSwitchUpdate (value, callback) {
    try {
      callback()
      const params = { switches: this.consts.defaultMultiSwitchOff }
      const valveValue = this.vService.getCharacteristic(this.hapChar.Active).value
      params.switches[0].switch = value ? 'on' : 'off'
      params.switches[1].switch = valveValue === 1 ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheOnOff = value ? 'on' : 'off'
      this.accessory.eveService.addEntry({ status: value ? 1 : 0 })
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalValveUpdate (value, callback) {
    try {
      callback()
      const params = { switches: this.consts.defaultMultiSwitchOff }
      const switchValue = this.sService.getCharacteristic(this.hapChar.On).value
      params.switches[0].switch = switchValue ? 'on' : 'off'
      params.switches[1].switch = value === 1 ? 'on' : 'off'
      this.vService.updateCharacteristic(this.hapChar.InUse, value)
      switch (value) {
        case 0:
          this.vService.updateCharacteristic(this.hapChar.RemainingDuration, 0)
          clearTimeout(this.timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [stopped].', this.name)
          }
          break
        case 1: {
          const timer = this.vService.getCharacteristic(this.hapChar.SetDuration).value
          this.vService.updateCharacteristic(this.hapChar.RemainingDuration, timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [running].', this.name)
          }
          this.timer = setTimeout(() => {
            this.vService.setCharacteristic(this.hapChar.Active, 0)
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
      if (!params.switches) {
        return
      }
      if (this.cacheOnOff !== (params.switches[0].switch === 'on')) {
        const newStatus = params.switches[0].switch === 'on'
        this.cacheOnOff = params.switches[0].switch
        this.sService.updateCharacteristic(this.hapChar.On, newStatus)
        this.accessory.eveService.addEntry({ status: newStatus ? 1 : 0 })
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
        }
      }
      if (params.switches[1].switch === 'on') {
        if (this.vService.getCharacteristic(this.hapChar.Active).value === 0) {
          const timer = this.vService.getCharacteristic(this.hapChar.SetDuration).value
          this.vService.updateCharacteristic(this.hapChar.Active, 1)
            .updateCharacteristic(this.hapChar.InUse, 1)
            .updateCharacteristic(this.hapChar.RemainingDuration, timer)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current state [running].', this.name)
          }
          this.timer = setTimeout(() => {
            this.vService.setCharacteristic(this.hapChar.Active, 0)
          }, timer * 1000)
        }
        return
      }
      this.vService.updateCharacteristic(this.hapChar.Active, 0)
        .updateCharacteristic(this.hapChar.InUse, 0)
        .updateCharacteristic(this.hapChar.RemainingDuration, 0)
      clearTimeout(this.timer)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
