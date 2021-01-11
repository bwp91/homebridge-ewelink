/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceSwitchValve {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.switchService = accessory.getService(this.Service.Switch) || accessory.addService(this.Service.Switch)
    if (!(this.valveService = accessory.getService(this.Service.Valve))) {
      this.valveService = accessory.addService(this.Service.Valve)
      this.valveService.setCharacteristic(this.Characteristic.Active, 0)
        .setCharacteristic(this.Characteristic.InUse, 0)
        .setCharacteristic(this.Characteristic.ValveType, 1)
        .setCharacteristic(this.Characteristic.SetDuration, 120)
        .addCharacteristic(this.Characteristic.RemainingDuration)
    }
    this.switchService.getCharacteristic(this.Characteristic.On)
      .on('set', this.internalSwitchUpdate.bind(this))
    this.valveService.getCharacteristic(this.Characteristic.Active)
      .on('set', this.internalValveUpdate.bind(this))
    this.valveService.getCharacteristic(this.Characteristic.SetDuration)
      .on('set', (value, callback) => {
        if (this.valveService.getCharacteristic(this.Characteristic.InUse).value) {
          this.valveService.updateCharacteristic(this.Characteristic.RemainingDuration, value)
          clearTimeout(this.timer)
          this.timer = setTimeout(() => this.valveService.setCharacteristic(this.Characteristic.Active, 0), value * 1000)
        }
        callback()
      })
    accessory.log = this.log
    accessory.eveService = new this.platform.eveService('switch', accessory)
    this.accessory = accessory
  }

  async internalSwitchUpdate (value, callback) {
    try {
      callback()
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      params.switches[0].switch = value ? 'on' : 'off'
      params.switches[1].switch = this.valveService.getCharacteristic(this.Characteristic.Active).value === 1 ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheOnOff = value ? 'on' : 'off'
      this.accessory.eveService.addEntry({ status: value ? 1 : 0 })
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.accessory.displayName, this.cacheOnOff)
      }
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
          clearTimeout(this.timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [stopped].', this.accessory.displayName)
          }
          break
        case 1: {
          const timer = this.valveService.getCharacteristic(this.Characteristic.SetDuration).value
          this.valveService.updateCharacteristic(this.Characteristic.RemainingDuration, timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [running].', this.accessory.displayName)
          }
          this.timer = setTimeout(() => {
            this.valveService.setCharacteristic(this.Characteristic.Active, 0)
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
      if (!params.switches) return
      if (this.cacheOnOff !== (params.switches[0].switch === 'on')) {
        const newStatus = params.switches[0].switch === 'on'
        this.cacheOnOff = params.switches[0].switch
        this.switchService.updateCharacteristic(this.Characteristic.On, newStatus)
        this.accessory.eveService.addEntry({ status: newStatus ? 1 : 0 })
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.accessory.displayName, this.cacheOnOff)
        }
      }
      if (params.switches[1].switch === 'on') {
        if (this.valveService.getCharacteristic(this.Characteristic.Active).value === 0) {
          const timer = this.valveService.getCharacteristic(this.Characteristic.SetDuration).value
          this.valveService.updateCharacteristic(this.Characteristic.Active, 1)
            .updateCharacteristic(this.Characteristic.InUse, 1)
            .updateCharacteristic(this.Characteristic.RemainingDuration, timer)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current state [running].', this.accessory.displayName)
          }
          this.timer = setTimeout(() => {
            this.valveService.setCharacteristic(this.Characteristic.Active, 0)
          }, timer * 1000)
        }
        return
      }
      this.valveService.updateCharacteristic(this.Characteristic.Active, 0)
        .updateCharacteristic(this.Characteristic.InUse, 0)
        .updateCharacteristic(this.Characteristic.RemainingDuration, 0)
      clearTimeout(this.timer)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
