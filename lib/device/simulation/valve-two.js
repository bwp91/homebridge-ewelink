/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceValveTwo {
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

    // We want two valve services for this accessory
    ;['A', 'B'].forEach(v => {
      // Add the valve service if it doesn't already exist
      let valveService
      if (!(valveService = this.accessory.getService('Valve ' + v))) {
        valveService = this.accessory.addService(
          this.hapServ.Valve,
          'Valve ' + v,
          'valve' + v.toLowerCase()
        )
        valveService.setCharacteristic(this.hapChar.Active, 0)
        valveService.setCharacteristic(this.hapChar.InUse, 0)
        valveService.setCharacteristic(this.hapChar.ValveType, 1)
        valveService.setCharacteristic(this.hapChar.SetDuration, 120)
        valveService.addCharacteristic(this.hapChar.RemainingDuration)
      }

      // Add the set handler to the valve active characteristic
      valveService.getCharacteristic(this.hapChar.Active).onSet(async value => {
        await this.internalUpdate('Valve ' + v, value)
      })

      // Add the set handler to the valve set duration characteristic
      valveService.getCharacteristic(this.hapChar.SetDuration).onSet(value => {
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

  async internalUpdate (valve, value) {
    try {
      const params = {
        switches: []
      }
      const valveService = this.accessory.getService(valve)
      switch (valve) {
        case 'Valve A':
          params.switches.push({ switch: value ? 'on' : 'off', outlet: 0 })
          break
        case 'Valve B':
          params.switches.push({ switch: value ? 'on' : 'off', outlet: 1 })
          break
      }
      valveService.updateCharacteristic(this.hapChar.InUse, value)
      switch (value) {
        case 0:
          valveService.updateCharacteristic(this.hapChar.RemainingDuration, 0)
          clearTimeout(this.accessory.getService(valve).timer)
          if (!this.disableDeviceLogging) {
            this.log(
              '[%s] %s [%s %s].',
              this.name,
              this.lang.curState,
              valve,
              this.lang.valveNo
            )
          }
          break
        case 1: {
          const timer = valveService.getCharacteristic(this.hapChar.SetDuration).value
          valveService.updateCharacteristic(this.hapChar.RemainingDuration, timer)
          if (!this.disableDeviceLogging) {
            this.log(
              '[%s] %s [%s %s].',
              this.name,
              this.lang.curState,
              valve,
              this.lang.valveYes
            )
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
      const valveService = this.accessory.getService(valve)
      setTimeout(() => {
        valveService.updateCharacteristic(this.hapChar.Active, value === 1 ? 0 : 1)
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
        const valveService = this.accessory.getService('Valve ' + v)
        if (params.switches[k].switch === 'on') {
          if (valveService.getCharacteristic(this.hapChar.Active).value === 0) {
            const timer = valveService.getCharacteristic(this.hapChar.SetDuration).value
            valveService.updateCharacteristic(this.hapChar.Active, 1)
            valveService.updateCharacteristic(this.hapChar.InUse, 1)
            valveService.updateCharacteristic(this.hapChar.RemainingDuration, timer)
            if (params.updateSource && !this.disableDeviceLogging) {
              this.log(
                '[%s] %s [Valve %s %s].',
                this.name,
                this.lang.curState,
                v,
                this.lang.valveYes
              )
            }
            valveService.timer = setTimeout(() => {
              valveService.setCharacteristic(this.hapChar.Active, 0)
            }, timer * 1000)
          }
          return
        }
        valveService.updateCharacteristic(this.hapChar.Active, 0)
        valveService.updateCharacteristic(this.hapChar.InUse, 0)
        valveService.updateCharacteristic(this.hapChar.RemainingDuration, 0)
        clearTimeout(valveService.timer)
      })
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
