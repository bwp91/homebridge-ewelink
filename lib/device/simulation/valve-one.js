/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceValveOne {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
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

    const asConfig = platform.simulations[this.accessory.context.eweDeviceId]
    if (!['oneSwitch', 'twoSwitch'].includes(asConfig.setup)) {
      this.error = 'setup must be oneSwitch or twoSwitch'
    }
    this.setup = asConfig.setup
    if (!(this.service = this.accessory.getService(this.hapServ.Valve))) {
      this.service = this.accessory.addService(this.hapServ.Valve)
      this.service.setCharacteristic(this.hapChar.Active, 0)
        .setCharacteristic(this.hapChar.InUse, 0)
        .setCharacteristic(this.hapChar.ValveType, 1)
        .setCharacteristic(this.hapChar.SetDuration, 120)
        .addCharacteristic(this.hapChar.RemainingDuration)
    }
    this.service.getCharacteristic(this.hapChar.Active)
      .on('set', this.internalUpdate.bind(this))
    this.service.getCharacteristic(this.hapChar.SetDuration)
      .on('set', (value, callback) => {
        if (this.service.getCharacteristic(this.hapChar.InUse).value === 1) {
          this.service.updateCharacteristic(this.hapChar.RemainingDuration, value)
          clearTimeout(this.timer)
          this.timer = setTimeout(
            () => this.service.setCharacteristic(this.hapChar.Active, 0),
            value * 1000
          )
        }
        callback()
      })
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      if (this.error) {
        this.log.warn('[%s] invalid config - %s.', this.name, this.error)
        return
      }
      const params = {}
      switch (this.setup) {
        case 'oneSwitch':
          params.switch = value ? 'on' : 'off'
          break
        case 'twoSwitch':
          params.switches = this.consts.defaultMultiSwitchOff
          params.switches[0].switch = value ? 'on' : 'off'
          break
      }
      this.service.updateCharacteristic(this.hapChar.InUse, value)
      switch (value) {
        case 0:
          this.service.updateCharacteristic(this.hapChar.RemainingDuration, 0)
          clearTimeout(this.timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [stopped].', this.name)
          }
          break
        case 1: {
          const timer = this.service.getCharacteristic(this.hapChar.SetDuration).value
          this.service.updateCharacteristic(this.hapChar.RemainingDuration, timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [running].', this.name)
          }
          this.timer = setTimeout(() => {
            this.service.setCharacteristic(this.hapChar.Active, 0)
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
      if (this.error) {
        this.log.warn('[%s] invalid config - %s.', this.name, this.error)
        return
      }
      let isOn = false
      switch (this.setup) {
        case 'oneSwitch':
          if (!params.switch) {
            return
          }
          isOn = params.switch === 'on'
          break
        case 'twoSwitch':
          if (!params.switches) {
            return
          }
          isOn = params.switches[0].switch === 'on'
          break
      }
      if (isOn) {
        if (this.service.getCharacteristic(this.hapChar.Active).value === 0) {
          const timer = this.service.getCharacteristic(this.hapChar.SetDuration).value
          this.service.updateCharacteristic(this.hapChar.Active, 1)
            .updateCharacteristic(this.hapChar.InUse, 1)
            .updateCharacteristic(this.hapChar.RemainingDuration, timer)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current state [running].', this.name)
          }
          this.timer = setTimeout(() => {
            this.service.setCharacteristic(this.hapChar.Active, 0)
          }, timer * 1000)
        }
        return
      }
      this.service.updateCharacteristic(this.hapChar.Active, 0)
        .updateCharacteristic(this.hapChar.InUse, 0)
        .updateCharacteristic(this.hapChar.RemainingDuration, 0)
      clearTimeout(this.timer)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
