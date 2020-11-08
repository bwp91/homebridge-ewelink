/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const helpers = require('./../helpers')
module.exports = class deviceLightDimmer {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    const lightService = accessory.getService(this.Service.Lightbulb) || accessory.addService(this.Service.Lightbulb)
    lightService
      .getCharacteristic(this.Characteristic.On)
      .on('set', (value, callback) => this.internalUpdate('onoff', value, callback))
    lightService.getCharacteristic(this.Characteristic.Brightness)
      .on('set', (value, callback) => this.internalUpdate('brightness', value, callback))
    this.accessory = accessory
  }

  async internalUpdate (type, value, callback) {
    try {
      callback()
      const params = {}
      switch (type) {
        case 'onoff':
          params.switch = value ? 'on' : 'off'
          await this.platform.sendDeviceUpdate(this.accessory, params)
          break
        case 'brightness': {
          const updateKey = Math.random().toString(36).substr(2, 8)
          this.accessory.context.updateKey = updateKey
          switch (this.accessory.context.eweUIID) {
            case 36:
              // *** KING-M4 eWeLink scale is 10-100 and HomeKit scale is 0-100. *** \\
              params.bright = Math.round((value * 9) / 10 + 10)
              break
            case 44:
              // *** D1 eWeLink scale matches HomeKit scale of 0-100 *** \\
              params.brightness = value
              params.mode = 0
              break
          }
          await helpers.sleep(500)
          if (updateKey !== this.accessory.context.updateKey) return
          await this.platform.sendDeviceUpdate(this.accessory, params)
          break
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      const lightService = this.accessory.getService(this.Service.Lightbulb)
      const isOn = helpers.hasProperty(params, 'switch')
        ? params.switch === 'on'
        : lightService.getCharacteristic(this.Characteristic.On).value
      if (isOn) {
        lightService.updateCharacteristic(this.Characteristic.On, true)
        switch (this.accessory.context.eweUIID) {
          case 36:
            // *** KING-M4 eWeLink scale is 10-100 and HomeKit scale is 0-100. *** \\
            if (helpers.hasProperty(params, 'bright')) {
              const nb = Math.round(((params.bright - 10) * 10) / 9)
              lightService.updateCharacteristic(this.Characteristic.Brightness, nb)
            }
            break
          case 44:
            // *** D1 eWeLink scale matches HomeKit scale of 0-100 *** \\
            if (helpers.hasProperty(params, 'brightness')) {
              lightService.updateCharacteristic(this.Characteristic.Brightness, params.brightness)
            }
            break
        }
      } else {
        lightService.updateCharacteristic(this.Characteristic.On, false)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
