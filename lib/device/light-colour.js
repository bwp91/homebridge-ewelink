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
      .on('set', this.internalColourUpdate.bind(this))
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
    if (accessory.context.eweUIID === 104) {
      this.lightService
        .getCharacteristic(this.Characteristic.ColorTemperature)
        .on('set', this.internalCTempUpdate.bind(this))
      /*
      if (platform.api.versionGreaterOrEqual && platform.api.versionGreaterOrEqual('1.3.0-beta.27')) {
        this.alController = new platform.api.hap.AdaptiveLightingController(this.lightService)
        accessory.configureController(this.alController)
      }
      */
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
      this.ignoreForAMoment = true
      setTimeout(() => (this.ignoreForAMoment = false), 3000)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalBrightnessUpdate (value, callback) {
    try {
      let params
      await this.helpers.sleep(750)
      callback()
      if (this.lastSentBrightness === value) return
      this.lastSentBrightness = value
      const updateKeyBright = Math.random().toString(36).substr(2, 8)
      this.updateKeyBright = updateKeyBright
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
          // *** B02-B-A60, B05-B-A60, GTLC104 *** \\
          // *** need the current colour values sent too *** \\
          if (this.cacheMode === 'white') {
            params = {
              ltype: 'white',
              white: {
                br: value,
                ct: this.cacheCTemp
              }
            }
          } else {
            params = {
              ltype: 'color',
              color: {
                br: value,
                r: this.cacheR,
                g: this.cacheG,
                b: this.cacheB
              }
            }
          }
          break
      }
      await this.helpers.sleep(500)
      if (updateKeyBright !== this.updateKeyBright) return
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.ignoreForAMoment = true
      setTimeout(() => (this.ignoreForAMoment = false), 3000)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalColourUpdate (value, callback) {
    try {
      await this.helpers.sleep(1500)
      callback()
      if (this.lastSentColour === value) return
      this.lastSentColour = value
      let params
      const newRGB = this.helpers.hs2rgb([value, this.lightService.getCharacteristic(this.Characteristic.Saturation).value])
      const updateKeyColour = Math.random().toString(36).substr(2, 8)
      this.updateKeyColour = updateKeyColour
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
          // *** B02-B-A60, B05-B-A60, GTLC104 *** \\
          params = {
            ltype: 'color',
            color: {
              br: this.lightService.getCharacteristic(this.Characteristic.Brightness).value,
              r: newRGB[0],
              g: newRGB[1],
              b: newRGB[2]
            }
          }
          this.cacheMode = 'colour'
          this.cacheR = newRGB[0]
          this.cacheG = newRGB[1]
          this.cacheB = newRGB[2]
          break
      }
      await this.helpers.sleep(500)
      if (updateKeyColour !== this.updateKeyColour) return
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.ignoreForAMoment = true
      setTimeout(() => (this.ignoreForAMoment = false), 3000)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalCTempUpdate (value, callback) {
    try {
      await this.helpers.sleep(1500)
      callback()
      if (this.cacheLastCTemp === value) return
      this.cacheLastCTemp = value
      if (this.accessory.context.eweUIID !== 104) return
      const updateKeyCTemp = Math.random().toString(36).substr(2, 8)
      this.updateKeyCTemp = updateKeyCTemp
      // *** B02-B-A60, B05-B-A60, GTLC104 *** \\
      // HomeKit has a ct range of 140-500 corresponding to 2000-7143K
      // These devices have a range of 2700K-6500K corresponding to ct: 0-255
      const kelvin = Math.max(Math.min(Math.round(1000000 / value), 6500), 2700)
      const kToCT = Math.round(((kelvin - 2700) / 3800) * 255)
      const params = {
        ltype: 'white',
        white: {
          br: this.lightService.getCharacteristic(this.Characteristic.Brightness).value,
          ct: kToCT
        }
      }
      this.cacheMode = 'white'
      this.cacheCTemp = kToCT
      await this.helpers.sleep(500)
      if (updateKeyCTemp !== this.updateKeyCTemp) return
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.ignoreForAMoment = true
      setTimeout(() => (this.ignoreForAMoment = false), 3000)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.ignoreForAMoment) return
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
            } else {
              if (params.updateSource) this.log.warn('[%s] white mode is unsupported by this plugin.', this.accessory.displayName)
            }
            break
          case 59:
            // *** L1 *** \\
            if (this.helpers.hasProperty(params, 'bright')) {
              this.lightService.updateCharacteristic(this.Characteristic.Brightness, params.bright)
            }
            if (this.helpers.hasProperty(params, 'colorR')) {
              newColour = this.helpers.rgb2hs([params.colorR, params.colorG, params.colorB])
              this.lightService
                .updateCharacteristic(this.Characteristic.Hue, newColour[0])
                .updateCharacteristic(this.Characteristic.Saturation, newColour[1])
            }
            break
          case 104:
            // *** B02-B-A60, B05-B-A60, GTLC104 *** \\
            if (this.helpers.hasProperty(params, 'color')) {
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
                this.cacheMode = 'colour'
                this.cacheR = params.color.r
                this.cacheG = params.color.g
                this.cacheB = params.color.b
              }
            } else if (this.helpers.hasProperty(params, 'white')) {
              if (this.helpers.hasProperty(params.white, 'br')) {
                this.lightService.updateCharacteristic(this.Characteristic.Brightness, params.white.br)
              }
              if (this.helpers.hasProperty(params.white, 'ct')) {
                // HomeKit has a ct range of 140-500 corresponding to 2000-7143K
                // These devices have a range of 2700K-6500K corresponding to ct: 0-255
                const ctToK = Math.round(params.white.ct / 255 * 3800 + 2700)
                const kToMired = Math.round(1000000 / ctToK)
                this.lightService.updateCharacteristic(this.Characteristic.ColorTemperature, kToMired)
                this.cacheMode = 'white'
                this.cacheCTemp = params.white.ct
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
