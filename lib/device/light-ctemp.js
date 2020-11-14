/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const helpers = require('./../helpers')
module.exports = class deviceLightColour {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.lightService = accessory.getService(this.Service.Lightbulb) || accessory.addService(this.Service.Lightbulb)
    this.lightService
      .getCharacteristic(this.Characteristic.On)
      .on('set', (value, callback) => this.internalUpdate('onoff', value, callback))
    this.lightService
      .getCharacteristic(this.Characteristic.Brightness)
      .on('set', (value, callback) => this.internalUpdate('brightness', value, callback))
    this.lightService
      .getCharacteristic(this.Characteristic.ColorTemperature)
      .on('set', (value, callback) => this.internalUpdate('colour', value, callback))
    this.accessory = accessory
  }

  async internalUpdate (type, value, callback) {
    try {
      let params = {}
      switch (type) {
        case 'onoff':
          callback()
          params.switch = value ? 'on' : 'off'
          await this.platform.sendDeviceUpdate(this.accessory, params)
          break
        case 'brightness': {
          await helpers.sleep(1000)
          callback()
          const updateKeyBright = Math.random().toString(36).substr(2, 8)
          this.accessory.context.updateKeyBright = updateKeyBright
          // *** Device needs the current ct value sent too *** \\
          params = {
            ltype: 'white',
            white: {
              br: value,
              ct: this.accessory.context.cacheCT
            }
          }
          await helpers.sleep(500)
          if (updateKeyBright !== this.accessory.context.updateKeyBright) return
          await this.platform.sendDeviceUpdate(this.accessory, params)
          break
        }
        case 'colour': {
          await helpers.sleep(2000)
          callback()
          const updateKeyColour = Math.random().toString(36).substr(2, 8)
          this.accessory.context.updateKeyColour = updateKeyColour
          // HomeKit has a ct range of 140-500 corresponding to 2000-7143K
          // B02-F-A60 has a range of 2200K-6500K corresponding to ct: 0-255
          let mToK = Math.round(1000000 / value)
          if (mToK < 2200) mToK = 2200
          if (mToK > 6500) mToK = 6500
          const kToCT = Math.round(((mToK - 2200) / 4300) * 255)
          params = {
            ltype: 'white',
            white: {
              ct: kToCT,
              br: this.lightService.getCharacteristic(this.Characteristic.Brightness).value
            }
          }
          this.accessory.context.cacheCT = kToCT
          await helpers.sleep(1000)
          if (updateKeyColour !== this.accessory.context.updateKeyColour) return
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
      if (helpers.hasProperty(params, 'updateSource') && params.updateSource === 'LAN') return
      let mode
      let isOn = false
      if (helpers.hasProperty(params, 'switch')) {
        isOn = params.switch === 'on'
      } else {
        isOn = this.lightService.getCharacteristic(this.Characteristic.On).value
      }
      if (isOn) {
        this.lightService.updateCharacteristic(this.Characteristic.On, true)
        if (helpers.hasProperty(params, 'ltype')) {
          mode = params.ltype
          if (mode === 'white' && helpers.hasProperty(params, 'white')) {
            if (helpers.hasProperty(params.white, 'br')) {
              this.lightService.updateCharacteristic(this.Characteristic.Brightness, params.white.br)
            }
            if (helpers.hasProperty(params.white, 'ct')) {
              // B02-F-A60 has a range of 2200K-6500K corresponding to ct: 0-255
              // HomeKit has a ct range of 140-500 corresponding to 2000-7143K

              const ctToK = Math.round(params.white.ct / 255 * 4300 + 2200)
              const kToMired = Math.round(1000000 / ctToK)

              this.lightService.updateCharacteristic(this.Characteristic.ColorTemperature, kToMired)
              this.accessory.context.cacheCT = params.white.ct
            }
          }
        }
      } else {
        this.lightService.updateCharacteristic(this.Characteristic.On, false)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
