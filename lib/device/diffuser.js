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
      .on('set', (value, callback) => this.internalDiffuserOnOffUpdate(accessory, value, callback))
    onOffService
      .getCharacteristic(this.Characteristic.RotationSpeed)
      .on('set', (value, callback) => this.internalDiffuserStateUpdate(accessory, value, callback))
      .setProps({
        minStep: 50
      })
    lightService
      .getCharacteristic(this.Characteristic.On)
      .on('set', (value, callback) => this.internalLightOnOffUpdate(accessory, value, callback))
    lightService
      .getCharacteristic(this.Characteristic.Brightness)
      .on('set', (value, callback) => this.internalLightBrightnessUpdate(accessory, value, callback))
    lightService
      .getCharacteristic(this.Characteristic.Hue)
      .on('set', (value, callback) => this.internalLightColourUpdate(accessory, value, callback))
    lightService
      .getCharacteristic(this.Characteristic.Saturation)
      .on('set', (value, callback) => callback())
  }

  async internalDiffuserOnOffUpdate (accessory, value, callback) {
    callback()
    try {
      const params = { switch: value ? 'on' : 'off' }
      await this.platform.sendDeviceUpdate(accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async internalDiffuserStateUpdate (accessory, value, callback) {
    try {
      await helpers.sleep(1000)
      callback()
      if (value === 0) return
      value = value <= 75 ? 50 : 100
      const params = { state: value / 2 }
      accessory.context.cacheState = value
      await this.platform.sendDeviceUpdate(accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async internalLightOnOffUpdate (accessory, value, callback) {
    try {
      callback()
      const params = { lightswitch: value ? 1 : 0 }
      await this.platform.sendDeviceUpdate(accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async internalLightBrightnessUpdate (accessory, value, callback) {
    try {
      await helpers.sleep(2000)
      callback()
      const updateKeyBright = Math.random().toString(36).substr(2, 8)
      accessory.context.updateKeyBright = updateKeyBright
      const params = {
        lightbright: value
      }
      await helpers.sleep(500)
      if (updateKeyBright !== accessory.context.updateKeyBright) return
      await this.platform.sendDeviceUpdate(accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async internalLightColourUpdate (accessory, value, callback) {
    try {
      await helpers.sleep(2000)
      callback()
      const updateKeyColour = Math.random().toString(36).substr(2, 8)
      accessory.context.updateKeyColour = updateKeyColour
      const newRGB = convert.hsv.rgb(
        value,
        accessory.getService('Light').getCharacteristic(this.Characteristic.Saturation).value,
        100
      )
      const params = {
        lightRcolor: newRGB[0],
        lightGcolor: newRGB[1],
        lightBcolor: newRGB[2]
      }
      await helpers.sleep(500)
      if (updateKeyColour !== accessory.context.updateKeyColour) return
      await this.platform.sendDeviceUpdate(accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {
      if (helpers.hasProperty(params, 'switch')) {
        accessory.getService('Diffuser').updateCharacteristic(this.Characteristic.On, params.switch === 'on')
        if (!helpers.hasProperty(params, 'state')) {
          accessory.getService('Diffuser').updateCharacteristic(this.Characteristic.RotationSpeed, accessory.context.cacheState)
        }
      }
      if (helpers.hasProperty(params, 'state')) {
        accessory.getService('Diffuser').updateCharacteristic(this.Characteristic.RotationSpeed, params.state * 50)
        accessory.context.cacheState = params.state * 50
      }
      if (helpers.hasProperty(params, 'lightswitch')) {
        accessory.getService('Light')
          .updateCharacteristic(this.Characteristic.On, params.lightswitch === 1)
      }
      if (helpers.hasProperty(params, 'lightbright')) {
        accessory.getService('Light')
          .updateCharacteristic(this.Characteristic.Brightness, params.lightbright)
      }
      if (
        helpers.hasProperty(params, 'lightRcolor') &&
        helpers.hasProperty(params, 'lightGcolor') &&
        helpers.hasProperty(params, 'lightBcolor')
      ) {
        const newColour = convert.rgb.hsv(params.lightRcolor, params.lightGcolor, params.lightBcolor)
        accessory.getService('Light')
          .updateCharacteristic(this.Characteristic.Hue, newColour[0])
          .updateCharacteristic(this.Characteristic.Saturation, 100)
      }
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
