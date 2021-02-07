/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceCurtain {
  constructor (platform, accessory) {
    this.platform = platform
    this.funcs = platform.funcs
    this.messages = platform.messages
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.name = accessory.displayName
    this.accessory = accessory

    this.service = this.accessory.getService(this.hapServ.WindowCovering) || this.accessory.addService(this.hapServ.WindowCovering)
    this.service.getCharacteristic(this.hapChar.TargetPosition)
      .on('set', this.internalUpdate.bind(this))
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      const params = {}
      if ([0, 100].includes(value)) {
        params.switch = value === 100 ? 'on' : 'off'
      } else {
        params.setclose = Math.abs(100 - value)
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switch && !this.funcs.hasProperty(params, 'setclose')) {
        return
      }
      const newPos = Math.abs(100 - parseInt(params.setclose))
      this.service.updateCharacteristic(this.hapChar.TargetPosition, newPos)
        .updateCharacteristic(this.hapChar.CurrentPosition, newPos)
        .updateCharacteristic(this.hapChar.PositionState, 2)
      if (params.updateSource && this.cachePosition !== newPos) {
        this.cachePosition = newPos
        if (!this.disableDeviceLogging) {
          this.log('[%s] current position [%s%].', this.name, this.cachePosition)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
