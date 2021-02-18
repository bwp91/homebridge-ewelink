/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceCurtain {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.singleDevices[deviceId]
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Add the window covering service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.WindowCovering) ||
      this.accessory.addService(this.hapServ.WindowCovering)

    // Add the set handler to the target position characteristic
    this.service.getCharacteristic(this.hapChar.TargetPosition)
      .on('set', this.internalUpdate.bind(this))

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({ disableDeviceLogging: this.disableDeviceLogging })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
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
