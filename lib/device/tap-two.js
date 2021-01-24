/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceTapTwo {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    ;['A', 'B'].forEach(v => {
      let tapService
      if (!(tapService = accessory.getService(this.S.Valve))) {
        tapService = accessory.addService(this.S.Valve)
        tapService.setCharacteristic(this.C.Active, 0)
          .setCharacteristic(this.C.InUse, 0)
          .setCharacteristic(this.C.ValveType, 3)
      }
      tapService.getCharacteristic(this.C.Active)
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
          params.switches[1].switch = this.accessory.getService('Tap B').getCharacteristic(this.C.Active).value === 1
            ? 'on'
            : 'off'
          break
        case 'Tap B':
          params.switches[0].switch = this.accessory.getService('Tap A').getCharacteristic(this.C.Active).value === 1
            ? 'on'
            : 'off'
          params.switches[1].switch = value ? 'on' : 'off'
          break
      }
      tapService.updateCharacteristic(this.C.InUse, value)
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
      if (!params.switches) {
        return
      }
      ;['A', 'B'].forEach((v, k) => {
        const tapService = this.accessory.getService('Valve ' + v)
        tapService.updateCharacteristic(this.C.Active, params.switches[k].switch === 'on' ? 1 : 0)
          .updateCharacteristic(this.C.InUse, params.switches[k].switch === 'on' ? 1 : 0)
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
