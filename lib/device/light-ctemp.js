/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceLightColour {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.lightService = accessory.getService(this.Service.Lightbulb) || accessory.addService(this.Service.Lightbulb)
    this.lightService
      .getCharacteristic(this.Characteristic.On)
      .on('set', this.internalOnOffUpdate.bind(this))
    this.lightService
      .getCharacteristic(this.Characteristic.Brightness)
      .on('set', this.internalBrightnessUpdate.bind(this))
    this.lightService
      .getCharacteristic(this.Characteristic.ColorTemperature)
      .on('set', this.internalColourTempUpdate.bind(this))
    if (platform.api.versionGreaterOrEqual && platform.api.versionGreaterOrEqual('1.3.0-beta.27')) {
      this.alController = new platform.api.hap.AdaptiveLightingController(this.lightService)
      accessory.configureController(this.alController)
    }
    this.accessory = accessory
  }

  async internalOnOffUpdate (value, callback) {
    try {
      callback()
      const params = { switch: value ? 'on' : 'off' }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalBrightnessUpdate (value, callback) {
    try {
      await this.helpers.sleep(750)
      callback()
      if (this.lastSentBrightness === value) return
      this.lastSentBrightness = value
      const updateKeyBright = Math.random().toString(36).substr(2, 8)
      this.accessory.context.updateKeyBright = updateKeyBright
      // *** Device needs the current ct value sent too *** \\
      const params = {
        ltype: 'white',
        white: {
          br: value,
          ct: this.accessory.context.cacheCT
        }
      }
      await this.helpers.sleep(350)
      if (updateKeyBright !== this.accessory.context.updateKeyBright) return
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalColourTempUpdate (value, callback) {
    try {
      await this.helpers.sleep(1500)
      callback()
      if (this.lastSentColour === value) return
      this.lastSentColour = value
      const updateKeyColour = Math.random().toString(36).substr(2, 8)
      this.updateKeyColour = updateKeyColour
      // HomeKit has a ct range of 140-500 corresponding to 2000-7143K
      // B02-F-A60 has a range of 2200K-6500K corresponding to ct: 0-255
      let mToK = Math.round(1000000 / value)
      if (mToK < 2200) mToK = 2200
      if (mToK > 6500) mToK = 6500
      const kToCT = Math.round(((mToK - 2200) / 4300) * 255)
      const params = {
        switch: this.lightService.getCharacteristic(this.Characteristic.On).value ? 'on' : 'off',
        ltype: 'white',
        white: {
          ct: kToCT,
          br: this.lightService.getCharacteristic(this.Characteristic.Brightness).value
        }
      }
      this.accessory.context.cacheCT = kToCT
      await this.helpers.sleep(350)
      if (updateKeyColour !== this.updateKeyColour) return
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.helpers.hasProperty(params, 'updateSource') && params.updateSource === 'LAN') return
      let mode
      let isOn = false
      if (this.helpers.hasProperty(params, 'switch')) {
        isOn = params.switch === 'on'
      } else {
        isOn = this.lightService.getCharacteristic(this.Characteristic.On).value
      }
      if (isOn) {
        this.lightService.updateCharacteristic(this.Characteristic.On, true)
        if (this.helpers.hasProperty(params, 'ltype')) {
          mode = params.ltype
          if (mode === 'white' && this.helpers.hasProperty(params, 'white')) {
            if (this.helpers.hasProperty(params.white, 'br')) {
              this.lightService.updateCharacteristic(this.Characteristic.Brightness, params.white.br)
            }
            if (this.helpers.hasProperty(params.white, 'ct')) {
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
