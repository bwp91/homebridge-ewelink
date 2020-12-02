/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceSwitchValve {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    const valveConfig = this.platform.cusG.get(accessory.context.hbDeviceId)
    this.switchService = accessory.getService(this.Service.Switch) || accessory.addService(this.Service.Switch)
    if (!(this.valveService = accessory.getService(this.Service.Valve))) {
      this.valveService = accessory.addService(this.Service.Valve)
      this.valveService
        .setCharacteristic(this.Characteristic.Active, 0)
        .setCharacteristic(this.Characteristic.InUse, 0)
        .setCharacteristic(this.Characteristic.ValveType, 1)
        .setCharacteristic(this.Characteristic.SetDuration, Math.round((valveConfig.operationTime || 1200) / 10))
        .addCharacteristic(this.Characteristic.RemainingDuration)
    }
    this.switchService
      .getCharacteristic(this.Characteristic.On)
      .on('set', this.internalSwitchUpdate.bind(this))
    this.valveService
      .getCharacteristic(this.Characteristic.Active)
      .on('set', this.internalValveUpdate.bind(this))
    this.valveService
      .getCharacteristic(this.Characteristic.SetDuration)
      .on('set', (value, callback) => {
        if (this.valveService.getCharacteristic(this.Characteristic.InUse).value) {
          this.valveService.updateCharacteristic(this.Characteristic.RemainingDuration, value)
          clearTimeout(this.valveService.timer)
          this.valveService.timer = setTimeout(() => this.valveService.setCharacteristic(this.Characteristic.Active, 0), value * 1000)
        }
        callback()
      })
    accessory.log = this.log
    accessory.eveLogger = new this.platform.eveService('switch', accessory, {
      storage: 'fs',
      path: this.platform.eveLogPath
    })
    this.accessory = accessory
  }

  async internalSwitchUpdate (value, callback) {
    try {
      callback()
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      params.switches[0].switch = value ? 'on' : 'off'
      params.switches[1].switch = this.valveService.getCharacteristic(this.Characteristic.Active).value === 1
        ? 'on'
        : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalValveUpdate (value, callback) {
    try {
      callback()
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      params.switches[0].switch = this.switchService.getCharacteristic(this.Characteristic.On).value ? 'on' : 'off'
      params.switches[1].switch = value === 1 ? 'on' : 'off'
      this.valveService.updateCharacteristic(this.Characteristic.InUse, value)
      switch (value) {
        case 0:
          this.valveService.updateCharacteristic(this.Characteristic.RemainingDuration, 0)
          clearTimeout(this.valveService.timer)
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
      if (!this.helpers.hasProperty(params, 'switches')) return

      this.switchService.updateCharacteristic(this.Characteristic.On, params.switches[0].switch === 'on')
      this.accessory.eveLogger.addEntry({
        time: Math.round(new Date().valueOf() / 1000),
        status: params.switch === 'on' ? 1 : 0
      })
      this.valveService
        .updateCharacteristic(this.Characteristic.Active, params.switches[1].switch === 'on' ? 1 : 0)
        .updateCharacteristic(this.Characteristic.InUse, params.switches[1].switch === 'on' ? 1 : 0)
      if (params.switches[1].switch === 'on') {
        if (this.valveService.getCharacteristic(this.Characteristic.Active).value === 0) {
          // only start the timer if it isn't on already - we don't want to reset an "already on" timer
          // if ewelink sends another update midway ie switch turning on/off
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
