/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const convert = require('color-convert')
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
      .getCharacteristic(this.Characteristic.Hue)
      .on('set', (value, callback) => this.internalUpdate('hue', value, callback))
    this.lightService
      .getCharacteristic(this.Characteristic.Saturation)
      .on('set', (value, callback) => callback())
    if (accessory.context.eweUIID === 22) {
      // *** B1 doesn't support brightness *** \\
      this.lightService
        .getCharacteristic(this.Characteristic.Brightness)
        .setProps({
          minStep: 100
        })
    }
    this.accessory = accessory
  }

  async internalUpdate (type, value, callback) {
    try {
      let newRGB
      let params = {}
      switch (type) {
        case 'onoff':
          callback()
          if (this.accessory.context.eweUIID === 22) {
          // **** B1 uses state rather than switch *** \\
            params.state = value ? 'on' : 'off'
          } else {
            params.switch = value ? 'on' : 'off'
          }
          await this.platform.sendDeviceUpdate(this.accessory, params)
          break
        case 'brightness': {
          await helpers.sleep(1000)
          callback()
          const updateKeyBright = Math.random().toString(36).substr(2, 8)
          this.accessory.context.updateKeyBright = updateKeyBright
          switch (this.accessory.context.eweUIID) {
            case 22:
              // *** B1 doesn't support brightness *** \\
              return
            case 59:
              // *** L1 *** \\
              params = {
                mode: 1,
                bright: value
              }
              break
            case 104:
            // *** GTLC104 needs the current rgb values sent too *** \\
              params = {
                ltype: 'color',
                color: {
                  br: value,
                  r: this.accessory.context.cacheR,
                  g: this.accessory.context.cacheG,
                  b: this.accessory.context.cacheB
                }
              }
              break
          }
          await helpers.sleep(500)
          if (updateKeyBright !== this.accessory.context.updateKeyBright) return
          await this.platform.sendDeviceUpdate(this.accessory, params)
          break
        }
        case 'hue': {
          await helpers.sleep(2000)
          callback()
          const updateKeyColour = Math.random().toString(36).substr(2, 8)
          this.accessory.context.updateKeyColour = updateKeyColour
          newRGB = convert.hsv.rgb(value, this.lightService.getCharacteristic(this.Characteristic.Saturation).value, 100)
          switch (this.accessory.context.eweUIID) {
            case 22:
            // *** B1 *** \\
              params = {
                zyx_mode: 2,
                type: 'middle',
                channel0: '0',
                channel1: '0',
                channel2: newRGB[0].toString(),
                channel3: newRGB[1].toString(),
                channel4: newRGB[2].toString()
              }
              break
            case 59:
              // *** L1 *** \\
              params = {
                mode: 1,
                colorR: newRGB[0],
                colorG: newRGB[1],
                colorB: newRGB[2]
              }
              break
            case 104:
              // *** GTLC104 *** \\
              params = {
                ltype: 'color',
                color: {
                  r: newRGB[0],
                  g: newRGB[1],
                  b: newRGB[2],
                  br: this.lightService.getCharacteristic(this.Characteristic.Brightness).value
                }
              }
              this.accessory.context.cacheR = newRGB[0]
              this.accessory.context.cacheG = newRGB[1]
              this.accessory.context.cacheB = newRGB[2]
              break
          }
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
      let newColour
      let mode
      let isOn = false
      if (this.accessory.context.eweUIID === 22 && helpers.hasProperty(params, 'state')) {
        isOn = params.state === 'on'
      } else if (this.accessory.context.eweUIID !== 22 && helpers.hasProperty(params, 'switch')) {
        isOn = params.switch === 'on'
      } else {
        isOn = this.lightService.getCharacteristic(this.Characteristic.On).value
      }
      if (isOn) {
        this.lightService.updateCharacteristic(this.Characteristic.On, true)
        switch (this.accessory.context.eweUIID) {
          case 22:
            // *** B1 *** \\
            if (helpers.hasProperty(params, 'zyx_mode')) {
              mode = parseInt(params.zyx_mode)
            } else if (helpers.hasProperty(params, 'channel0') && parseInt(params.channel0) + parseInt(params.channel1) > 0) {
              mode = 1
            } else {
              mode = 2
            }
            if (mode === 2) {
              newColour = convert.rgb.hsv(
                parseInt(params.channel2),
                parseInt(params.channel3),
                parseInt(params.channel4)
              )
              this.lightService
                .updateCharacteristic(this.Characteristic.Hue, newColour[0])
                .updateCharacteristic(this.Characteristic.Saturation, 100)
                .updateCharacteristic(this.Characteristic.Brightness, 100)
            }
            break
          case 59:
            // *** L1 *** \\
            if (helpers.hasProperty(params, 'bright')) {
              this.lightService.updateCharacteristic(this.Characteristic.Brightness, params.bright)
            }
            if (helpers.hasProperty(params, 'colorR')) {
              newColour = convert.rgb.hsv(params.colorR, params.colorG, params.colorB)
              this.lightService
                .updateCharacteristic(this.Characteristic.Hue, newColour[0])
                .updateCharacteristic(this.Characteristic.Saturation, newColour[1])
            }
            break
          case 104:
            // *** GTLC104 *** \\
            if (helpers.hasProperty(params, 'ltype')) {
              mode = params.ltype
              if (mode === 'color' && helpers.hasProperty(params, 'color')) {
                if (helpers.hasProperty(params.color, 'br')) {
                  this.lightService.updateCharacteristic(this.Characteristic.Brightness, params.color.br)
                }
                if (
                  helpers.hasProperty(params.color, 'r') &&
                  helpers.hasProperty(params.color, 'g') &&
                  helpers.hasProperty(params.color, 'b')
                ) {
                  newColour = convert.rgb.hsv(
                    parseInt(params.color.r),
                    parseInt(params.color.g),
                    parseInt(params.color.b)
                  )
                  this.lightService
                    .updateCharacteristic(this.Characteristic.Hue, newColour[0])
                    .updateCharacteristic(this.Characteristic.Saturation, 100)
                  this.accessory.context.cacheR = params.color.r
                  this.accessory.context.cacheG = params.color.g
                  this.accessory.context.cacheB = params.color.b
                }
              }
            }
            break
        }
      } else {
        this.lightService.updateCharacteristic(this.Characteristic.On, false)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
