/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceValveTwo {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
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
        .on('set', (value, callback) => this.internalUpdate('Valve ' + v, value, callback))
      valveService
        .getCharacteristic(this.Characteristic.SetDuration)
        .on('set', (value, callback) => {
          if (valveService.getCharacteristic(this.Characteristic.InUse).value === 1) {
            valveService.updateCharacteristic(this.Characteristic.RemainingDuration, value)
            clearTimeout(valveService.timer)
            valveService.timer = setTimeout(() => valveService.setCharacteristic(this.Characteristic.Active, 0), value * 1000)
          }
          callback()
        })
    })
    this.accessory = accessory
  }

  async internalUpdate (valve, value, callback) {
    try {
      callback()
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      const serviceValve = this.accessory.getService(valve)
      switch (valve) {
        case 'Valve A':
          params.switches[0].switch = value ? 'on' : 'off'
          params.switches[1].switch = this.accessory.getService('Valve B').getCharacteristic(this.Characteristic.Active).value === 1
            ? 'on'
            : 'off'
          break
        case 'Valve B':
          params.switches[0].switch = this.accessory.getService('Valve A').getCharacteristic(this.Characteristic.Active).value === 1
            ? 'on'
            : 'off'
          params.switches[1].switch = value ? 'on' : 'off'
          break
      }
      serviceValve.updateCharacteristic(this.Characteristic.InUse, value)
      switch (value) {
        case 0:
          serviceValve.updateCharacteristic(this.Characteristic.RemainingDuration, 0)
          clearTimeout(this.accessory.getService(valve).timer)
          break
        case 1: {
          const timer = serviceValve.getCharacteristic(this.Characteristic.SetDuration).value
          serviceValve.updateCharacteristic(this.Characteristic.RemainingDuration, timer)
          serviceValve.timer = setTimeout(() => serviceValve.setCharacteristic(this.Characteristic.Active, 0), timer * 1000)
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
      if (!this.helpers.hasProperty(params, 'switches')) return
      ;['A', 'B'].forEach((v, k) => {
        const valveService = this.accessory.getService('Valve ' + v)
        valveService
          .updateCharacteristic(this.Characteristic.Active, params.switches[k].switch === 'on' ? 1 : 0)
          .updateCharacteristic(this.Characteristic.InUse, params.switches[k].switch === 'on' ? 1 : 0)
        if (params.switches[k].switch === 'on') {
          if (valveService.getCharacteristic(this.Characteristic.Active).value === 0) {
            const timer = valveService.getCharacteristic(this.Characteristic.SetDuration).value
            valveService.updateCharacteristic(this.Characteristic.RemainingDuration, timer)
            valveService.timer = setTimeout(() => valveService.setCharacteristic(this.Characteristic.Active, 0), timer * 1000)
          }
        } else {
          valveService.updateCharacteristic(this.Characteristic.RemainingDuration, 0)
          clearTimeout(valveService.timer)
        }
      })
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
