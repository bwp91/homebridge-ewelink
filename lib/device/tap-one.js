/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceTapOne {
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
        .setCharacteristic(this.Characteristic.ValveType, 3)
    }
    this.service.getCharacteristic(this.Characteristic.Active)
      .on('set', this.internalUpdate.bind(this))
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
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheOnOff = value ? 'on' : 'off'
      this.service.updateCharacteristic(this.Characteristic.InUse, value)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.accessory.displayName, this.cacheOnOff)
      }
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
      switch (this.setup) {
        case 'oneSwitch':
          if (!params.switch || params.switch === this.cacheOnOff) {
            return
          }
          this.cacheOnOff = params.switch
          break
        case 'twoSwitch':
          if (!params.switches || params.switches[0].switch === this.cacheOnOff) {
            return
          }
          this.cacheOnOff = params.switches[0].switch
          break
      }
      this.service.updateCharacteristic(this.Characteristic.Active, this.cacheOnOff === 'on' ? 1 : 0)
        .updateCharacteristic(this.Characteristic.InUse, this.cacheOnOff === 'on' ? 1 : 0)
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.accessory.displayName, this.cacheOnOff)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
