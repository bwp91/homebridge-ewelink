/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const helpers = require('./../helpers')
module.exports = class deviceValveTwo {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    ;['A', 'B'].forEach(v => {
      let valveService
      const valveConfig = this.platform.cusG.get(accessory.context.hbDeviceId)
      if (!(valveService = accessory.getService('Valve ' + v))) {
        accessory
          .addService(this.Service.Valve, 'Valve ' + v, 'valve' + v.toLowerCase())
          .setCharacteristic(this.Characteristic.Active, 0)
          .setCharacteristic(this.Characteristic.InUse, 0)
          .setCharacteristic(this.Characteristic.ValveType, 1)
          .setCharacteristic(this.Characteristic.SetDuration, Math.round((valveConfig.operationTime || 1200) / 10))
          .addCharacteristic(this.Characteristic.RemainingDuration)
        valveService = accessory.getService('Valve ' + v)
      }
      valveService
        .getCharacteristic(this.Characteristic.Active)
        .on('set', (value, callback) => this.internalUpdate(accessory, 'Valve ' + v, value, callback))
      valveService
        .getCharacteristic(this.Characteristic.SetDuration)
        .on('set', (value, callback) => {
          if (valveService.getCharacteristic(this.Characteristic.InUse).value) {
            valveService.updateCharacteristic(this.Characteristic.RemainingDuration, value)
            clearTimeout(valveService.timer)
            valveService.timer = setTimeout(() => valveService.setCharacteristic(this.Characteristic.Active, 0), value * 1000)
          }
          callback()
        })
    })
  }

  async internalUpdate (accessory, valve, value, callback) {
    try {
      callback()
      const params = { switches: helpers.defaultMultiSwitchOff }
      const serviceValve = accessory.getService(valve)
      switch (valve) {
        case 'Valve A':
          params.switches[0].switch = value ? 'on' : 'off'
          params.switches[1].switch = accessory.getService('Valve B').getCharacteristic(this.Characteristic.Active).value
            ? 'on'
            : 'off'
          break
        case 'Valve B':
          params.switches[0].switch = accessory.getService('Valve A').getCharacteristic(this.Characteristic.Active).value
            ? 'on'
            : 'off'
          params.switches[1].switch = value ? 'on' : 'off'
          break
      }
      serviceValve.updateCharacteristic(this.Characteristic.InUse, value)
      switch (value) {
        case 0:
          serviceValve.updateCharacteristic(this.Characteristic.RemainingDuration, 0)
          clearTimeout(accessory.getService(valve).timer)
          break
        case 1: {
          const timer = serviceValve.getCharacteristic(this.Characteristic.SetDuration).value
          serviceValve.updateCharacteristic(this.Characteristic.RemainingDuration, timer)
          serviceValve.timer = setTimeout(() => serviceValve.setCharacteristic(this.Characteristic.Active, 0), timer * 1000)
          break
        }
      }
      await this.platform.sendDeviceUpdate(accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {
      if (!helpers.hasProperty(params, 'switches')) return
      ;['A', 'B'].forEach((v, k) => {
        const valveService = accessory.getService('Valve ' + v)
        valveService
          .updateCharacteristic(this.Characteristic.Active, params.switches[k].switch === 'on')
          .updateCharacteristic(this.Characteristic.InUse, params.switches[k].switch === 'on')
        if (params.switches[k].switch === 'on') {
          const timer = valveService.getCharacteristic(this.Characteristic.SetDuration).value
          valveService.updateCharacteristic(this.Characteristic.RemainingDuration, timer)
          valveService.timer = setTimeout(() => valveService.setCharacteristic(this.Characteristic.Active, 0), timer * 1000)
        } else {
          valveService.updateCharacteristic(this.Characteristic.RemainingDuration, 0)
          clearTimeout(valveService.timer)
        }
      })
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
