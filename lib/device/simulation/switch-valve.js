/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceSwitchValve {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    this.dName = accessory.displayName
    this.accessory = accessory

    this.sService = this.accessory.getService(this.S.Switch) || this.accessory.addService(this.S.Switch)
    if (!(this.vService = this.accessory.getService(this.S.Valve))) {
      this.vService = this.accessory.addService(this.S.Valve)
      this.vService.setCharacteristic(this.C.Active, 0)
        .setCharacteristic(this.C.InUse, 0)
        .setCharacteristic(this.C.ValveType, 1)
        .setCharacteristic(this.C.SetDuration, 120)
        .addCharacteristic(this.C.RemainingDuration)
    }
    this.sService.getCharacteristic(this.C.On)
      .on('set', this.internalSwitchUpdate.bind(this))
    this.vService.getCharacteristic(this.C.Active)
      .on('set', this.internalValveUpdate.bind(this))
    this.vService.getCharacteristic(this.C.SetDuration)
      .on('set', (value, callback) => {
        if (this.vService.getCharacteristic(this.C.InUse).value) {
          this.vService.updateCharacteristic(this.C.RemainingDuration, value)
          clearTimeout(this.timer)
          this.timer = setTimeout(() => this.vService.setCharacteristic(this.C.Active, 0), value * 1000)
        }
        callback()
      })
    this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
    this.accessory.historyService = new this.platform.eveService('switch', this.accessory, {
      storage: 'fs',
      path: platform.eveLogPath
    })
  }

  async internalSwitchUpdate (value, callback) {
    try {
      callback()
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      params.switches[0].switch = value ? 'on' : 'off'
      params.switches[1].switch = this.vService.getCharacteristic(this.C.Active).value === 1 ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheOnOff = value ? 'on' : 'off'
      this.accessory.historyService.addEntry({
        time: Math.round(new Date().valueOf() / 1000),
        status: value ? 1 : 0
      })
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.dName, this.cacheOnOff)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalValveUpdate (value, callback) {
    try {
      callback()
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      params.switches[0].switch = this.sService.getCharacteristic(this.C.On).value ? 'on' : 'off'
      params.switches[1].switch = value === 1 ? 'on' : 'off'
      this.vService.updateCharacteristic(this.C.InUse, value)
      switch (value) {
        case 0:
          this.vService.updateCharacteristic(this.C.RemainingDuration, 0)
          clearTimeout(this.timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [stopped].', this.dName)
          }
          break
        case 1: {
          const timer = this.vService.getCharacteristic(this.C.SetDuration).value
          this.vService.updateCharacteristic(this.C.RemainingDuration, timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [running].', this.dName)
          }
          this.timer = setTimeout(() => {
            this.vService.setCharacteristic(this.C.Active, 0)
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
        this.sService.updateCharacteristic(this.C.On, newStatus)
        this.accessory.historyService.addEntry({
          time: Math.round(new Date().valueOf() / 1000),
          status: newStatus ? 1 : 0
        })
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.dName, this.cacheOnOff)
        }
      }
      if (params.switches[1].switch === 'on') {
        if (this.vService.getCharacteristic(this.C.Active).value === 0) {
          const timer = this.vService.getCharacteristic(this.C.SetDuration).value
          this.vService.updateCharacteristic(this.C.Active, 1)
            .updateCharacteristic(this.C.InUse, 1)
            .updateCharacteristic(this.C.RemainingDuration, timer)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current state [running].', this.dName)
          }
          this.timer = setTimeout(() => {
            this.vService.setCharacteristic(this.C.Active, 0)
          }, timer * 1000)
        }
        return
      }
      this.vService.updateCharacteristic(this.C.Active, 0)
        .updateCharacteristic(this.C.InUse, 0)
        .updateCharacteristic(this.C.RemainingDuration, 0)
      clearTimeout(this.timer)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
