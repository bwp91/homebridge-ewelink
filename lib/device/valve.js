/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceValve {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    const valveConfig = this.platform.cusG.get(accessory.context.hbDeviceId)
    if (!(this.valveService = accessory.getService(this.Service.Valve))) {
      this.valveService = accessory.addService(this.Service.Valve)
      this.valveService
        .setCharacteristic(this.Characteristic.Active, 0)
        .setCharacteristic(this.Characteristic.InUse, 0)
        .setCharacteristic(this.Characteristic.ValveType, 1)
        .setCharacteristic(this.Characteristic.SetDuration, Math.round((valveConfig.operationTime || 1200) / 10))
        .addCharacteristic(this.Characteristic.RemainingDuration)
    }
    this.valveService
      .getCharacteristic(this.Characteristic.Active)
      .on('set', this.internalUpdate.bind(this))
    this.valveService
      .getCharacteristic(this.Characteristic.SetDuration)
      .on('set', (value, callback) => {
        if (this.valveService.getCharacteristic(this.Characteristic.InUse).value === 1) {
          this.valveService.updateCharacteristic(this.Characteristic.RemainingDuration, value)
          clearTimeout(this.valveService.timer)
          this.valveService.timer = setTimeout(
            () => this.valveService.setCharacteristic(this.Characteristic.Active, 0),
            value * 1000
          )
        }
        callback()
      })
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      const params = { switch: value ? 'on' : 'off' }
      this.valveService.updateCharacteristic(this.Characteristic.InUse, value)
      switch (value) {
        case 0:
          this.valveService.updateCharacteristic(this.Characteristic.RemainingDuration, 0)
          clearTimeout(this.accessory.getService(this.Service.Valve).timer)
          break
        case 1: {
          const timer = this.valveService.getCharacteristic(this.Characteristic.SetDuration).value
          this.valveService.updateCharacteristic(this.Characteristic.RemainingDuration, timer)
          this.valveService.timer = setTimeout(() => this.valveService.setCharacteristic(this.Characteristic.Active, 0), timer * 1000)
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
      if (!this.helpers.hasProperty(params, 'switch')) return
      this.valveService
        .updateCharacteristic(this.Characteristic.Active, params.switch === 'on' ? 1 : 0)
        .updateCharacteristic(this.Characteristic.InUse, params.switch === 'on' ? 1 : 0)
      if (params.switch === 'on') {
        if (this.valveService.getCharacteristic(this.Characteristic.Active).value === 0) {
          const timer = this.valveService.getCharacteristic(this.Characteristic.SetDuration).value
          this.valveService.updateCharacteristic(this.Characteristic.RemainingDuration, timer)
          this.valveService.timer = setTimeout(() => this.valveService.setCharacteristic(this.Characteristic.Active, 0), timer * 1000)
        }
      } else {
        this.valveService.updateCharacteristic(this.Characteristic.RemainingDuration, 0)
        clearTimeout(this.valveService.timer)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
