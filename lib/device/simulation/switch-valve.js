/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSwitchValve {
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

    this.sService = this.accessory.getService(this.hapServ.Switch) || this.accessory.addService(this.hapServ.Switch)
    if (!(this.vService = this.accessory.getService(this.hapServ.Valve))) {
      this.vService = this.accessory.addService(this.hapServ.Valve)
      this.vService.setCharacteristic(this.hapChar.Active, 0)
        .setCharacteristic(this.hapChar.InUse, 0)
        .setCharacteristic(this.hapChar.ValveType, 1)
        .setCharacteristic(this.hapChar.SetDuration, 120)
        .addCharacteristic(this.hapChar.RemainingDuration)
    }
    this.sService.getCharacteristic(this.hapChar.On)
      .on('set', this.internalSwitchUpdate.bind(this))
    this.vService.getCharacteristic(this.hapChar.Active)
      .on('set', this.internalValveUpdate.bind(this))
    this.vService.getCharacteristic(this.hapChar.SetDuration)
      .on('set', (value, callback) => {
        if (this.vService.getCharacteristic(this.hapChar.InUse).value) {
          this.vService.updateCharacteristic(this.hapChar.RemainingDuration, value)
          clearTimeout(this.timer)
          this.timer = setTimeout(() => this.vService.setCharacteristic(this.hapChar.Active, 0), value * 1000)
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
      const params = { switches: this.consts.defaultMultiSwitchOff }
      params.switches[0].switch = value ? 'on' : 'off'
      params.switches[1].switch = this.vService.getCharacteristic(this.hapChar.Active).value === 1 ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheOnOff = value ? 'on' : 'off'
      this.accessory.historyService.addEntry({
        time: Math.round(new Date().valueOf() / 1000),
        status: value ? 1 : 0
      })
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalValveUpdate (value, callback) {
    try {
      callback()
      const params = { switches: this.consts.defaultMultiSwitchOff }
      params.switches[0].switch = this.sService.getCharacteristic(this.hapChar.On).value ? 'on' : 'off'
      params.switches[1].switch = value === 1 ? 'on' : 'off'
      this.vService.updateCharacteristic(this.hapChar.InUse, value)
      switch (value) {
        case 0:
          this.vService.updateCharacteristic(this.hapChar.RemainingDuration, 0)
          clearTimeout(this.timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [stopped].', this.name)
          }
          break
        case 1: {
          const timer = this.vService.getCharacteristic(this.hapChar.SetDuration).value
          this.vService.updateCharacteristic(this.hapChar.RemainingDuration, timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [running].', this.name)
          }
          this.timer = setTimeout(() => {
            this.vService.setCharacteristic(this.hapChar.Active, 0)
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
        this.sService.updateCharacteristic(this.hapChar.On, newStatus)
        this.accessory.historyService.addEntry({
          time: Math.round(new Date().valueOf() / 1000),
          status: newStatus ? 1 : 0
        })
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
        }
      }
      if (params.switches[1].switch === 'on') {
        if (this.vService.getCharacteristic(this.hapChar.Active).value === 0) {
          const timer = this.vService.getCharacteristic(this.hapChar.SetDuration).value
          this.vService.updateCharacteristic(this.hapChar.Active, 1)
            .updateCharacteristic(this.hapChar.InUse, 1)
            .updateCharacteristic(this.hapChar.RemainingDuration, timer)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current state [running].', this.name)
          }
          this.timer = setTimeout(() => {
            this.vService.setCharacteristic(this.hapChar.Active, 0)
          }, timer * 1000)
        }
        return
      }
      this.vService.updateCharacteristic(this.hapChar.Active, 0)
        .updateCharacteristic(this.hapChar.InUse, 0)
        .updateCharacteristic(this.hapChar.RemainingDuration, 0)
      clearTimeout(this.timer)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
