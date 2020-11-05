/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const convert = require('color-convert')
const helpers = require('./../helpers')
module.exports = class deviceDiffuser {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    const onOffService = accessory.getService('Diffuser') || accessory.addService(this.Service.Fan, 'Diffuser', 'diffuser')
    const lightService = accessory.getService('Light') || accessory.addService(this.Service.Lightbulb, 'Light', 'light')
    onOffService
      .getCharacteristic(this.Characteristic.On)
      .on('set', (value, callback) => this.internalDiffuserOnOffUpdate(value, callback))
    this.accessory = accessory
    onOffService
      .getCharacteristic(this.Characteristic.RotationSpeed)
      .on('set', (value, callback) => this.internalDiffuserStateUpdate(value, callback))
      .setProps({
        minStep: 50
      })
    lightService
      .getCharacteristic(this.Characteristic.On)
      .on('set', (value, callback) => this.internalLightOnOffUpdate(value, callback))
    lightService
      .getCharacteristic(this.Characteristic.Brightness)
      .on('set', (value, callback) => this.internalLightBrightnessUpdate(value, callback))
    lightService
      .getCharacteristic(this.Characteristic.Hue)
      .on('set', (value, callback) => this.internalLightColourUpdate(value, callback))
    lightService
      .getCharacteristic(this.Characteristic.Saturation)
      .on('set', (value, callback) => callback())
    this.accessory = accessory
  }

  async internalDiffuserOnOffUpdate (value, callback) {
    callback()
    try {
      const params = { switch: value ? 'on' : 'off' }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalDiffuserStateUpdate (value, callback) {
    try {
      await helpers.sleep(1000)
      callback()
      if (value === 0) return
      const value = value <= 75 ? 50 : 100
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
      await helpers.sleep(1000)
      callback()
      const updateKeyBright = Math.random().toString(36).substr(2, 8)
      this.accessory.context.updateKeyBright = updateKeyBright
      const params = {
        lightbright: value
      }
      await helpers.sleep(500)
      if (updateKeyBright !== this.accessory.context.updateKeyBright) return
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalLightColourUpdate (value, callback) {
    callback()
    try {
      const updateKeyColour = Math.random().toString(36).substr(2, 8)
      this.accessory.context.updateKeyColour = updateKeyColour
      const newRGB = convert.hsv.rgb(value, this.accessory.getService('Light')
        .getCharacteristic(this.Characteristic.Saturation).value, 100)
      const params = {
        lightRcolor: newRGB[0],
        lightGcolor: newRGB[1],
        lightBcolor: newRGB[2]
      }
      await helpers.sleep(500)
      if (updateKeyColour !== this.accessory.context.updateKeyColour) return
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (helpers.hasProperty(params, 'switch')) {
        this.accessory.getService('Diffuser').updateCharacteristic(this.Characteristic.On, params.switch === 'on')
        if (!helpers.hasProperty(params, 'state')) {
          this.accessory.getService('Diffuser').updateCharacteristic(this.Characteristic.RotationSpeed, this.accessory.context.cacheState)
        }
      }
      if (helpers.hasProperty(params, 'state')) {
        this.accessory.getService('Diffuser').updateCharacteristic(this.Characteristic.RotationSpeed, params.state * 50)
        this.accessory.context.cacheState = params.state * 50
      }
      if (helpers.hasProperty(params, 'lightswitch')) {
        this.accessory.getService('Light')
          .updateCharacteristic(this.Characteristic.On, params.lightswitch === 1)
      }
      if (helpers.hasProperty(params, 'lightbright')) {
        this.accessory.getService('Light')
          .updateCharacteristic(this.Characteristic.Brightness, params.lightbright)
      }
      if (
        helpers.hasProperty(params, 'lightRcolor') &&
        helpers.hasProperty(params, 'lightGcolor') &&
        helpers.hasProperty(params, 'lightBcolor')
      ) {
        const newColour = convert.rgb.hsv(params.lightRcolor, params.lightGcolor, params.lightBcolor)
        this.accessory.getService('Light')
          .updateCharacteristic(this.Characteristic.Hue, newColour[0])
          .updateCharacteristic(this.Characteristic.Saturation, 100)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
