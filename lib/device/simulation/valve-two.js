/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceValveTwo {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    ;['A', 'B'].forEach(v => {
      let valveService
      if (!(valveService = this.accessory.getService('Valve ' + v))) {
        valveService = this.accessory.addService(this.hapServ.Valve, 'Valve ' + v, 'valve' + v.toLowerCase())
        valveService.setCharacteristic(this.hapChar.Active, 0)
          .setCharacteristic(this.hapChar.InUse, 0)
          .setCharacteristic(this.hapChar.ValveType, 1)
          .setCharacteristic(this.hapChar.SetDuration, 120)
          .addCharacteristic(this.hapChar.RemainingDuration)
      }
      valveService.getCharacteristic(this.hapChar.Active)
        .on('set', (value, callback) => this.internalUpdate('Valve ' + v, value, callback))
      valveService.getCharacteristic(this.hapChar.SetDuration)
        .on('set', (value, callback) => {
          if (valveService.getCharacteristic(this.hapChar.InUse).value === 1) {
            valveService.updateCharacteristic(this.hapChar.RemainingDuration, value)
            clearTimeout(valveService.timer)
            valveService.timer = setTimeout(() => valveService.setCharacteristic(this.hapChar.Active, 0), value * 1000)
          }
          callback()
        })
    })
  }

  async internalUpdate (valve, value, callback) {
    try {
      callback()
      const params = { switches: this.consts.defaultMultiSwitchOff }
      const valveService = this.accessory.getService(valve)
      switch (valve) {
        case 'Valve A':
          params.switches[0].switch = value ? 'on' : 'off'
          params.switches[1].switch = this.accessory.getService('Valve B').getCharacteristic(this.hapChar.Active).value === 1
            ? 'on'
            : 'off'
          break
        case 'Valve B':
          params.switches[0].switch = this.accessory.getService('Valve A').getCharacteristic(this.hapChar.Active).value === 1
            ? 'on'
            : 'off'
          params.switches[1].switch = value ? 'on' : 'off'
          break
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
      ;['A', 'B'].forEach((v, k) => {
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
