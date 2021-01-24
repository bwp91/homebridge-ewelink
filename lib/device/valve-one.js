/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceValveOne {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    const asConfig = platform.cusG.get(accessory.context.eweDeviceId)
    if (!['oneSwitch', 'twoSwitch'].includes(asConfig.setup)) {
      this.error = 'setup must be oneSwitch or twoSwitch'
    }
    this.setup = asConfig.setup
    if (!(this.service = accessory.getService(this.S.Valve))) {
      this.service = accessory.addService(this.S.Valve)
      this.service.setCharacteristic(this.C.Active, 0)
        .setCharacteristic(this.C.InUse, 0)
        .setCharacteristic(this.C.ValveType, 1)
        .setCharacteristic(this.C.SetDuration, 120)
        .addCharacteristic(this.C.RemainingDuration)
    }
    this.service.getCharacteristic(this.C.Active)
      .on('set', this.internalUpdate.bind(this))
    this.service.getCharacteristic(this.C.SetDuration)
      .on('set', (value, callback) => {
        if (this.service.getCharacteristic(this.C.InUse).value === 1) {
          this.service.updateCharacteristic(this.C.RemainingDuration, value)
          clearTimeout(this.timer)
          this.timer = setTimeout(
            () => this.service.setCharacteristic(this.C.Active, 0),
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
      if (this.error) {
        this.log.warn('[%s] invalid config - %s.', this.accessory.displayName, this.error)
        return
      }
      const params = {}
      switch (this.setup) {
        case 'oneSwitch':
          params.switch = value ? 'on' : 'off'
          break
        case 'twoSwitch':
          params.switches = this.helpers.defaultMultiSwitchOff
          params.switches[0].switch = value ? 'on' : 'off'
          break
      }
      this.service.updateCharacteristic(this.C.InUse, value)
      switch (value) {
        case 0:
          this.service.updateCharacteristic(this.C.RemainingDuration, 0)
          clearTimeout(this.timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [stopped].', this.accessory.displayName)
          }
          break
        case 1: {
          const timer = this.service.getCharacteristic(this.C.SetDuration).value
          this.service.updateCharacteristic(this.C.RemainingDuration, timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [running].', this.accessory.displayName)
          }
          this.timer = setTimeout(() => {
            this.service.setCharacteristic(this.C.Active, 0)
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
        this.log.warn('[%s] invalid config - %s.', this.accessory.displayName, this.error)
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
        if (this.service.getCharacteristic(this.C.Active).value === 0) {
          const timer = this.service.getCharacteristic(this.C.SetDuration).value
          this.service.updateCharacteristic(this.C.Active, 1)
            .updateCharacteristic(this.C.InUse, 1)
            .updateCharacteristic(this.C.RemainingDuration, timer)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current state [running].', this.accessory.displayName)
          }
          this.timer = setTimeout(() => {
            this.service.setCharacteristic(this.C.Active, 0)
          }, timer * 1000)
        }
        return
      }
      this.service.updateCharacteristic(this.C.Active, 0)
        .updateCharacteristic(this.C.InUse, 0)
        .updateCharacteristic(this.C.RemainingDuration, 0)
      clearTimeout(this.timer)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
