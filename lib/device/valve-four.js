/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceValveFour {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    this.dName = accessory.displayName
    this.accessory = accessory

    ;['A', 'B', 'C', 'D'].forEach(v => {
      let valveService
      if (!(valveService = this.accessory.getService('Valve ' + v))) {
        valveService = this.accessory.addService(this.S.Valve, 'Valve ' + v, 'valve' + v.toLowerCase())
        valveService.setCharacteristic(this.C.Active, 0)
          .setCharacteristic(this.C.InUse, 0)
          .setCharacteristic(this.C.ValveType, 1)
          .setCharacteristic(this.C.SetDuration, 120)
          .addCharacteristic(this.C.RemainingDuration)
      }
      valveService.getCharacteristic(this.C.Active)
        .on('set', (value, callback) => this.internalUpdate('Valve ' + v, value, callback))
      valveService.getCharacteristic(this.C.SetDuration)
        .on('set', (value, callback) => {
          if (valveService.getCharacteristic(this.C.InUse).value === 1) {
            valveService.updateCharacteristic(this.C.RemainingDuration, value)
            clearTimeout(valveService.timer)
            valveService.timer = setTimeout(() => valveService.setCharacteristic(this.C.Active, 0), value * 1000)
          }
          callback()
        })
    })
  }

  async internalUpdate (valve, value, callback) {
    try {
      callback()
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      const valveService = this.accessory.getService(valve)
      switch (valve) {
        case 'Valve A':
          params.switches[0].switch = value ? 'on' : 'off'
          params.switches[1].switch = this.accessory.getService('Valve B').getCharacteristic(this.C.Active).value === 1
            ? 'on'
            : 'off'
          params.switches[2].switch = this.accessory.getService('Valve C').getCharacteristic(this.C.Active).value === 1
            ? 'on'
            : 'off'
          params.switches[3].switch = this.accessory.getService('Valve D').getCharacteristic(this.C.Active).value === 1
            ? 'on'
            : 'off'
          break
        case 'Valve B':
          params.switches[0].switch = this.accessory.getService('Valve A').getCharacteristic(this.C.Active).value === 1
            ? 'on'
            : 'off'
          params.switches[1].switch = value ? 'on' : 'off'
          params.switches[2].switch = this.accessory.getService('Valve C').getCharacteristic(this.C.Active).value === 1
            ? 'on'
            : 'off'
          params.switches[3].switch = this.accessory.getService('Valve D').getCharacteristic(this.C.Active).value === 1
            ? 'on'
            : 'off'
          break
        case 'Valve C':
          params.switches[0].switch = this.accessory.getService('Valve A').getCharacteristic(this.C.Active).value === 1
            ? 'on'
            : 'off'
          params.switches[1].switch = this.accessory.getService('Valve B').getCharacteristic(this.C.Active).value === 1
            ? 'on'
            : 'off'
          params.switches[2].switch = value ? 'on' : 'off'
          params.switches[3].switch = this.accessory.getService('Valve D').getCharacteristic(this.C.Active).value === 1
            ? 'on'
            : 'off'
          break
        case 'Valve D':
          params.switches[0].switch = this.accessory.getService('Valve A').getCharacteristic(this.C.Active).value === 1
            ? 'on'
            : 'off'
          params.switches[1].switch = this.accessory.getService('Valve B').getCharacteristic(this.C.Active).value === 1
            ? 'on'
            : 'off'
          params.switches[2].switch = this.accessory.getService('Valve C').getCharacteristic(this.C.Active).value === 1
            ? 'on'
            : 'off'
          params.switches[3].switch = value ? 'on' : 'off'
          break
      }
      valveService.updateCharacteristic(this.C.InUse, value)
      switch (value) {
        case 0:
          valveService.updateCharacteristic(this.C.RemainingDuration, 0)
          clearTimeout(this.accessory.getService(valve).timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [%s stopped].', this.dName, valve)
          }
          break
        case 1: {
          const timer = valveService.getCharacteristic(this.C.SetDuration).value
          valveService.updateCharacteristic(this.C.RemainingDuration, timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [%s running].', this.dName, valve)
          }
          valveService.timer = setTimeout(() => {
            valveService.setCharacteristic(this.C.Active, 0)
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
          if (valveService.getCharacteristic(this.C.Active).value === 0) {
            const timer = valveService.getCharacteristic(this.C.SetDuration).value
            valveService.updateCharacteristic(this.C.Active, 1)
              .updateCharacteristic(this.C.InUse, 1)
              .updateCharacteristic(this.C.RemainingDuration, timer)
            if (params.updateSource && !this.disableDeviceLogging) {
              this.log('[%s] current state [Valve %s running].', this.dName, v)
            }
            valveService.timer = setTimeout(() => {
              valveService.setCharacteristic(this.C.Active, 0)
            }, timer * 1000)
          }
          return
        }
        valveService.updateCharacteristic(this.C.Active, 0)
          .updateCharacteristic(this.C.InUse, 0)
          .updateCharacteristic(this.C.RemainingDuration, 0)
        clearTimeout(valveService.timer)
      })
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
