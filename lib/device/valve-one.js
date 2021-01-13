/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceValveOne {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    const asConfig = platform.cusG.get(accessory.context.eweDeviceId)
    if (!['oneSwitch', 'twoSwitch'].includes(asConfig.setup)) {
      this.error = 'setup must be oneSwitch or twoSwitch'
    }
    this.setup = asConfig.setup
    if (!(this.service = accessory.getService(this.Service.Valve))) {
      this.service = accessory.addService(this.Service.Valve)
      this.service.setCharacteristic(this.Characteristic.Active, 0)
        .setCharacteristic(this.Characteristic.InUse, 0)
        .setCharacteristic(this.Characteristic.ValveType, 1)
        .setCharacteristic(this.Characteristic.SetDuration, 120)
        .addCharacteristic(this.Characteristic.RemainingDuration)
    }
    this.service.getCharacteristic(this.Characteristic.Active)
      .on('set', this.internalUpdate.bind(this))
    this.service.getCharacteristic(this.Characteristic.SetDuration)
      .on('set', (value, callback) => {
        if (this.service.getCharacteristic(this.Characteristic.InUse).value === 1) {
          this.service.updateCharacteristic(this.Characteristic.RemainingDuration, value)
          clearTimeout(this.timer)
          this.timer = setTimeout(
            () => this.service.setCharacteristic(this.Characteristic.Active, 0),
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
      this.service.updateCharacteristic(this.Characteristic.InUse, value)
      switch (value) {
        case 0:
          this.service.updateCharacteristic(this.Characteristic.RemainingDuration, 0)
          clearTimeout(this.timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [stopped].', this.accessory.displayName)
          }
          break
        case 1: {
          const timer = this.service.getCharacteristic(this.Characteristic.SetDuration).value
          this.service.updateCharacteristic(this.Characteristic.RemainingDuration, timer)
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [running].', this.accessory.displayName)
          }
          this.timer = setTimeout(() => {
            this.service.setCharacteristic(this.Characteristic.Active, 0)
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
        if (this.service.getCharacteristic(this.Characteristic.Active).value === 0) {
          const timer = this.service.getCharacteristic(this.Characteristic.SetDuration).value
          this.service.updateCharacteristic(this.Characteristic.Active, 1)
            .updateCharacteristic(this.Characteristic.InUse, 1)
            .updateCharacteristic(this.Characteristic.RemainingDuration, timer)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current state [running].', this.accessory.displayName)
          }
          this.timer = setTimeout(() => {
            this.service.setCharacteristic(this.Characteristic.Active, 0)
          }, timer * 1000)
        }
        return
      }
      this.service.updateCharacteristic(this.Characteristic.Active, 0)
        .updateCharacteristic(this.Characteristic.InUse, 0)
        .updateCharacteristic(this.Characteristic.RemainingDuration, 0)
      clearTimeout(this.timer)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
