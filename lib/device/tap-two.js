/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceTapTwo {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    ;['A', 'B'].forEach(v => {
      let tapService
      if (!(tapService = accessory.getService(this.Service.Valve))) {
        tapService = accessory.addService(this.Service.Valve)
        tapService.setCharacteristic(this.Characteristic.Active, 0)
          .setCharacteristic(this.Characteristic.InUse, 0)
          .setCharacteristic(this.Characteristic.ValveType, 3)
      }
      tapService
        .getCharacteristic(this.Characteristic.Active)
        .on('set', (value, callback) => this.internalUpdate('Tap ' + v, value, callback))
    })
    this.accessory = accessory
  }

  async internalUpdate (tap, value, callback) {
    try {
      callback()
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      const tapService = this.accessory.getService(tap)
      switch (tap) {
        case 'Tap A':
          params.switches[0].switch = value ? 'on' : 'off'
          params.switches[1].switch = this.accessory.getService('Tap B').getCharacteristic(this.Characteristic.Active).value === 1
            ? 'on'
            : 'off'
          break
        case 'Tap B':
          params.switches[0].switch = this.accessory.getService('Tap A').getCharacteristic(this.Characteristic.Active).value === 1
            ? 'on'
            : 'off'
          params.switches[1].switch = value ? 'on' : 'off'
          break
      }
      tapService.updateCharacteristic(this.Characteristic.InUse, value)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s %].', this.accessory.displayName, tap, value === 1 ? 'running' : 'stopped')
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switches) return
      ;['A', 'B'].forEach((v, k) => {
        const tapService = this.accessory.getService('Valve ' + v)
        tapService
          .updateCharacteristic(this.Characteristic.Active, params.switches[k].switch === 'on' ? 1 : 0)
          .updateCharacteristic(this.Characteristic.InUse, params.switches[k].switch === 'on' ? 1 : 0)
        const logText = params.switches[k].switch === 'on' ? 'running' : 'stopped'
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [Tap %s running].', this.accessory.displayName, v, logText)
        }
      })
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
