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
      .getCharacteristic(this.Characteristic.Hue)
      .on('set', this.internalHueUpdate.bind(this))
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

  async internalOnOffUpdate (value, callback) {
    try {
      callback()
      const params = {}
      if (this.accessory.context.eweUIID === 22) {
        // **** B1 uses state rather than switch *** \\
        params.state = value ? 'on' : 'off'
      } else {
        params.switch = value ? 'on' : 'off'
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalBrightnessUpdate (value, callback) {
    try {
      let params
      await this.helpers.sleep(750)
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
      await this.helpers.sleep(350)
      if (updateKeyBright !== this.accessory.context.updateKeyBright) return
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalHueUpdate (value, callback) {
    try {
      await this.helpers.sleep(1500)
      callback()
      let params
      const newRGB = this.helpers.hs2rgb([value, this.lightService.getCharacteristic(this.Characteristic.Saturation).value])
      const updateKeyColour = Math.random().toString(36).substr(2, 8)
      this.accessory.context.updateKeyColour = updateKeyColour
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
      await this.helpers.sleep(350)
      if (updateKeyColour !== this.accessory.context.updateKeyColour) return
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.helpers.hasProperty(params, 'updateSource') && params.updateSource === 'LAN') return
      let newColour
      let mode
      let isOn = false
      if (this.accessory.context.eweUIID === 22 && this.helpers.hasProperty(params, 'state')) {
        isOn = params.state === 'on'
      } else if (this.accessory.context.eweUIID !== 22 && this.helpers.hasProperty(params, 'switch')) {
        isOn = params.switch === 'on'
      } else {
        isOn = this.lightService.getCharacteristic(this.Characteristic.On).value
      }
      if (isOn) {
        this.lightService.updateCharacteristic(this.Characteristic.On, true)
        switch (this.accessory.context.eweUIID) {
          case 22:
            // *** B1 *** \\
            if (this.helpers.hasProperty(params, 'zyx_mode')) {
              mode = parseInt(params.zyx_mode)
            } else if (this.helpers.hasProperty(params, 'channel0') && parseInt(params.channel0) + parseInt(params.channel1) > 0) {
              mode = 1
            } else {
              mode = 2
            }
            if (mode === 2) {
              newColour = this.helpers.rgb2hs([
                parseInt(params.channel2),
                parseInt(params.channel3),
                parseInt(params.channel4)
              ])
              this.lightService
                .updateCharacteristic(this.Characteristic.Hue, newColour[0])
                .updateCharacteristic(this.Characteristic.Saturation, 100)
                .updateCharacteristic(this.Characteristic.Brightness, 100)
            }
            break
          case 59:
            // *** L1 *** \\
            if (this.helpers.hasProperty(params, 'bright')) {
              this.lightService.updateCharacteristic(this.Characteristic.Brightness, params.bright)
            }
            if (this.helpers.hasProperty(params, 'colorR')) {
              newColour = this.helpers.rgb2hs(params.colorR, params.colorG, params.colorB)
              this.lightService
                .updateCharacteristic(this.Characteristic.Hue, newColour[0])
                .updateCharacteristic(this.Characteristic.Saturation, newColour[1])
            }
            break
          case 104:
            // *** GTLC104 *** \\
            if (this.helpers.hasProperty(params, 'ltype')) {
              mode = params.ltype
              if (mode === 'color' && this.helpers.hasProperty(params, 'color')) {
                if (this.helpers.hasProperty(params.color, 'br')) {
                  this.lightService.updateCharacteristic(this.Characteristic.Brightness, params.color.br)
                }
                if (
                  this.helpers.hasProperty(params.color, 'r') &&
                  this.helpers.hasProperty(params.color, 'g') &&
                  this.helpers.hasProperty(params.color, 'b')
                ) {
                  newColour = this.helpers.rgb2hs([
                    parseInt(params.color.r),
                    parseInt(params.color.g),
                    parseInt(params.color.b)
                  ])
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
