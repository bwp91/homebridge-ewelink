/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceDiffuser {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.fanService = accessory.getService('Diffuser') || accessory.addService(this.Service.Fan, 'Diffuser', 'diffuser')
    this.lightService = accessory.getService('Light') || accessory.addService(this.Service.Lightbulb, 'Light', 'light')
    this.fanService
      .getCharacteristic(this.Characteristic.On)
      .on('set', this.internalDiffuserOnOffUpdate.bind(this))
    this.accessory = accessory
    this.fanService
      .getCharacteristic(this.Characteristic.RotationSpeed)
      .on('set', this.internalDiffuserStateUpdate.bind(this))
      .setProps({
        minStep: 50
      })
    this.lightService
      .getCharacteristic(this.Characteristic.On)
      .on('set', this.internalLightOnOffUpdate.bind(this))
    this.lightService
      .getCharacteristic(this.Characteristic.Brightness)
      .on('set', this.internalLightBrightnessUpdate.bind(this))
    this.lightService
      .getCharacteristic(this.Characteristic.Hue)
      .on('set', this.internalLightColourUpdate.bind(this))
    this.lightService
      .getCharacteristic(this.Characteristic.Saturation)
      .on('set', (value, callback) => callback())
    this.accessory = accessory
  }

  async internalDiffuserOnOffUpdate (value, callback) {
    try {
      callback()
      const params = { switch: value ? 'on' : 'off' }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalDiffuserStateUpdate (value, callback) {
    try {
      await this.helpers.sleep(750)
      callback()
      if (value === 0) return
      value = value <= 75 ? 50 : 100
      const params = { state: value / 2 }
      this.accessory.context.cacheState = value
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalLightOnOffUpdate (value, callback) {
    try {
      callback()
      const params = { lightswitch: value ? 1 : 0 }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalLightBrightnessUpdate (value, callback) {
    try {
      await this.helpers.sleep(1500)
      callback()
      const updateKeyBright = Math.random().toString(36).substr(2, 8)
      this.accessory.context.updateKeyBright = updateKeyBright
      const params = {
        lightbright: value
      }
      await this.helpers.sleep(350)
      if (updateKeyBright !== this.accessory.context.updateKeyBright) return
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalLightColourUpdate (value, callback) {
    try {
      await this.helpers.sleep(1500)
      callback()
      const updateKeyColour = Math.random().toString(36).substr(2, 8)
      this.accessory.context.updateKeyColour = updateKeyColour
      await this.helpers.sleep(700)
      const newRGB = this.helpers.hs2rgb([
        value,
        this.accessory.getService('Light').getCharacteristic(this.Characteristic.Saturation).value
      ])
      const params = {
        lightRcolor: newRGB[0],
        lightGcolor: newRGB[1],
        lightBcolor: newRGB[2]
      }
      if (updateKeyColour !== this.accessory.context.updateKeyColour) return
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.helpers.hasProperty(params, 'switch')) {
        this.fanService.updateCharacteristic(this.Characteristic.On, params.switch === 'on')
        if (!this.helpers.hasProperty(params, 'state')) {
          this.accessory.getService('Diffuser').updateCharacteristic(this.Characteristic.RotationSpeed, this.accessory.context.cacheState)
        }
      }
      if (this.helpers.hasProperty(params, 'state')) {
        this.fanService.updateCharacteristic(this.Characteristic.RotationSpeed, params.state * 50)
        this.accessory.context.cacheState = params.state * 50
      }
      if (this.helpers.hasProperty(params, 'lightswitch')) {
        this.lightService.updateCharacteristic(this.Characteristic.On, params.lightswitch === 1)
      }
      if (this.helpers.hasProperty(params, 'lightbright')) {
        this.lightService.updateCharacteristic(this.Characteristic.Brightness, params.lightbright)
      }
      if (
        this.helpers.hasProperty(params, 'lightRcolor') &&
        this.helpers.hasProperty(params, 'lightGcolor') &&
        this.helpers.hasProperty(params, 'lightBcolor')
      ) {
        const newColour = this.helpers.rgb2hs([params.lightRcolor, params.lightGcolor, params.lightBcolor])
        this.lightService
          .updateCharacteristic(this.Characteristic.Hue, newColour[0])
          .updateCharacteristic(this.Characteristic.Saturation, 100)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
