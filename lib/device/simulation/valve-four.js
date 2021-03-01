/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceValveFour {
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

    // We want four valve services for this accessory
    ;['A', 'B', 'C', 'D'].forEach(v => {
      // Add the valve service if it doesn't already exist
      let valveService
      if (!(valveService = this.accessory.getService('Valve ' + v))) {
        valveService = this.accessory.addService(
          this.hapServ.Valve,
          'Valve ' + v,
          'valve' + v.toLowerCase()
        )
        valveService.setCharacteristic(this.hapChar.Active, 0)
          .setCharacteristic(this.hapChar.InUse, 0)
          .setCharacteristic(this.hapChar.ValveType, 1)
          .setCharacteristic(this.hapChar.SetDuration, 120)
          .addCharacteristic(this.hapChar.RemainingDuration)
      }

      // Add the set handler to the valve active characteristic
      valveService.getCharacteristic(this.hapChar.Active)
        .on('set', (value, callback) => {
          this.internalUpdate('Valve ' + v, value, callback)
        })

      // Add the set handler to the valve set duration characteristic
      valveService.getCharacteristic(this.hapChar.SetDuration)
        .on('set', (value, callback) => {
          // Check if the valve is currently active
          if (valveService.getCharacteristic(this.hapChar.InUse).value === 1) {
            // Update the remaining duration characteristic with the new value
            valveService.updateCharacteristic(this.hapChar.RemainingDuration, value)

            // Clear any existing active timers
            clearTimeout(valveService.timer)

            // Set a new active timer with the new time amount
            valveService.timer = setTimeout(
              () => valveService.setCharacteristic(this.hapChar.Active, 0),
              value * 1000
            )
          }
          callback()
        })
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

  async internalUpdate (valve, value, callback) {
    try {
      callback()
      const params = {
        switches: this.accessory.context.eweUIID === 126
          ? this.consts.defaultDoubleSwitchOff
          : this.consts.defaultMultiSwitchOff
      }
      const valveService = this.accessory.getService(valve)
      switch (valve) {
        case 'Valve A': {
          const bValue = this.accessory.getService('Valve B')
            .getCharacteristic(this.hapChar.Active).value
          const cValue = this.accessory.getService('Valve C')
            .getCharacteristic(this.hapChar.Active).value
          const dValue = this.accessory.getService('Valve D')
            .getCharacteristic(this.hapChar.Active).value
          params.switches[0].switch = value ? 'on' : 'off'
          params.switches[1].switch = bValue === 1 ? 'on' : 'off'
          params.switches[2].switch = cValue === 1 ? 'on' : 'off'
          params.switches[3].switch = dValue === 1 ? 'on' : 'off'
          break
        }
        case 'Valve B': {
          const aValue = this.accessory.getService('Valve A')
            .getCharacteristic(this.hapChar.Active).value
          const cValue = this.accessory.getService('Valve C')
            .getCharacteristic(this.hapChar.Active).value
          const dValue = this.accessory.getService('Valve D')
            .getCharacteristic(this.hapChar.Active).value
          params.switches[0].switch = aValue === 1 ? 'on' : 'off'
          params.switches[1].switch = value ? 'on' : 'off'
          params.switches[2].switch = cValue === 1 ? 'on' : 'off'
          params.switches[3].switch = dValue === 1 ? 'on' : 'off'
          break
        }
        case 'Valve C': {
          const aValue = this.accessory.getService('Valve A')
            .getCharacteristic(this.hapChar.Active).value
          const bValue = this.accessory.getService('Valve B')
            .getCharacteristic(this.hapChar.Active).value
          const dValue = this.accessory.getService('Valve D')
            .getCharacteristic(this.hapChar.Active).value
          params.switches[0].switch = aValue === 1 ? 'on' : 'off'
          params.switches[1].switch = bValue === 1 ? 'on' : 'off'
          params.switches[2].switch = value ? 'on' : 'off'
          params.switches[3].switch = dValue === 1 ? 'on' : 'off'
          break
        }
        case 'Valve D': {
          const aValue = this.accessory.getService('Valve A')
            .getCharacteristic(this.hapChar.Active).value
          const bValue = this.accessory.getService('Valve B')
            .getCharacteristic(this.hapChar.Active).value
          const cValue = this.accessory.getService('Valve C')
            .getCharacteristic(this.hapChar.Active).value
          params.switches[0].switch = aValue === 1 ? 'on' : 'off'
          params.switches[1].switch = bValue === 1 ? 'on' : 'off'
          params.switches[2].switch = cValue === 1 ? 'on' : 'off'
          params.switches[3].switch = value ? 'on' : 'off'
          break
        }
      }
      valveService.updateCharacteristic(this.hapChar.InUse, value)
      switch (value) {
        case 0:
          valveService.updateCharacteristic(this.hapChar.RemainingDuration, 0)
          clearTimeout(this.accessory.getService(valve).timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [%s stopped].', this.name, valve)
          }
          break
        case 1: {
          const timer = valveService.getCharacteristic(this.hapChar.SetDuration).value
          valveService.updateCharacteristic(this.hapChar.RemainingDuration, timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [%s running].', this.name, valve)
          }
          valveService.timer = setTimeout(() => {
            valveService.setCharacteristic(this.hapChar.Active, 0)
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
      ;['A', 'B', 'C', 'D'].forEach((v, k) => {
        const valveService = this.accessory.getService('Valve ' + v)
        if (params.switches[k].switch === 'on') {
          if (valveService.getCharacteristic(this.hapChar.Active).value === 0) {
            const timer = valveService.getCharacteristic(this.hapChar.SetDuration).value
            valveService.updateCharacteristic(this.hapChar.Active, 1)
              .updateCharacteristic(this.hapChar.InUse, 1)
              .updateCharacteristic(this.hapChar.RemainingDuration, timer)
            if (params.updateSource && !this.disableDeviceLogging) {
              this.log('[%s] current state [Valve %s running].', this.name, v)
            }
            valveService.timer = setTimeout(() => {
              valveService.setCharacteristic(this.hapChar.Active, 0)
            }, timer * 1000)
          }
          return
        }
        valveService.updateCharacteristic(this.hapChar.Active, 0)
          .updateCharacteristic(this.hapChar.InUse, 0)
          .updateCharacteristic(this.hapChar.RemainingDuration, 0)
        clearTimeout(valveService.timer)
      })
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
