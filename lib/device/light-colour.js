/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceLightColour {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.colourUtils = platform.colourUtils
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    this.isB1 = accessory.context.eweUIID === 22
    this.service = accessory.getService(this.S.Lightbulb) || accessory.addService(this.S.Lightbulb)
    this.service.getCharacteristic(this.C.On)
      .on('set', this.internalOnOffUpdate.bind(this))
    this.service.getCharacteristic(this.C.Brightness)
      .on('set', this.internalBrightnessUpdate.bind(this))
    this.service.getCharacteristic(this.C.Hue)
      .on('set', this.internalColourUpdate.bind(this))
    this.service.getCharacteristic(this.C.Saturation)
      .on('set', (value, callback) => callback())
    if (accessory.context.eweUIID === 22) {
      // *** B1 doesn't support brightness *** \\
      this.service.getCharacteristic(this.C.Brightness)
        .setProps({ minStep: 100 })
    }
    this.accessory = accessory
    if ([59, 104].includes(accessory.context.eweUIID)) {
      // HomeKit has a range of 140-500M corresponding to 2000-7143K
      // Devices have a range of 2700K-6500K corresponding to ewelink ct: 0-255
      this.service.getCharacteristic(this.C.ColorTemperature)
        .on('set', this.internalCTempUpdate.bind(this))
      if (platform.api.versionGreaterOrEqual && platform.api.versionGreaterOrEqual('1.3.0-beta.46')) {
        this.cacheBrightness = this.service.getCharacteristic(this.C.Brightness).value
        this.alController = new platform.api.hap.AdaptiveLightingController(this.service)
        this.accessory.configureController(this.alController)
      }
    }
  }

  async internalOnOffUpdate (value, callback) {
    try {
      callback()
      const params = {}
      const onoff = value ? 'on' : 'off'
      if (this.cacheOnOff === onoff) {
        return
      }
      this.cacheOnOff = onoff
      if (this.isB1) {
        params.state = this.cacheOnOff
      } else {
        params.switch = this.cacheOnOff
      }
      const timerKey = Math.random().toString(36).substr(2, 8)
      this.updateTimeout = timerKey
      setTimeout(() => {
        if (this.updateTimeout === timerKey) this.updateTimeout = false
      }, 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.accessory.displayName, this.cacheOnOff)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalBrightnessUpdate (value, callback) {
    try {
      if (this.cacheBrightness === value) {
        callback()
        return
      }
      this.cacheBrightness = value
      callback()
      let params
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
          if (this.cacheMode === 'white') {
            params = {
              white: {
                br: value,
                ct: this.cacheCT
              }
            }
          } else {
            params = {
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
      await this.helpers.sleep(750)
      if (updateKeyBright !== this.updateKeyBright) {
        return
      }
      this.updateTimeout = updateKeyBright
      setTimeout(() => {
        if (this.updateTimeout === updateKeyBright) this.updateTimeout = false
      }, 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current brightness [%s%].', this.accessory.displayName, value)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalColourUpdate (value, callback) {
    try {
      if (this.cacheOnOff !== 'on' || this.cacheHue === value) {
        callback()
        return
      }
      this.cacheHue = value
      this.service.updateCharacteristic(this.C.ColorTemperature, 140)
      callback()
      let params
      const newRGB = this.colourUtils.hs2rgb(value, this.service.getCharacteristic(this.C.Saturation).value)
      this.cacheR = newRGB[0]
      this.cacheG = newRGB[1]
      this.cacheB = newRGB[2]
      this.cacheMired = 0
      this.cacheCT = 0
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
            channel2: this.cacheR.toString(),
            channel3: this.cacheG.toString(),
            channel4: this.cacheB.toString()
          }
          break
        case 59:
          // *** L1 *** \\
          params = {
            mode: 1,
            colorR: this.cacheR,
            colorG: this.cacheG,
            colorB: this.cacheB
          }
          break
        case 104:
          // *** B02-B-A60, B05-B-A60, GTLC104 *** \\
          params = {
            ltype: this.cacheMode === 'color' ? undefined : 'color',
            color: {
              br: this.cacheBrightness,
              r: this.cacheR,
              g: this.cacheG,
              b: this.cacheB
            }
          }
          this.cacheMode = 'color'
          break
      }
      await this.helpers.sleep(1500)
      if (updateKeyColour !== this.updateKeyColour) {
        return
      }
      this.updateTimeout = updateKeyColour
      setTimeout(() => {
        if (this.updateTimeout === updateKeyColour) this.updateTimeout = false
      }, 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current colour [rgb %s %s %s].', this.accessory.displayName, this.cacheR, this.cacheG, this.cacheB)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalCTempUpdate (value, callback) {
    try {
      if (this.cacheOnOff !== 'on' || this.cacheMired === value) {
        callback()
        return
      }
      this.cacheMired = value
      const hs = this.colourUtils.m2hs(this.cacheMired)
      this.cacheHue = hs[0]
      this.service.updateCharacteristic(this.C.Hue, this.cacheHue)
        .updateCharacteristic(this.C.Saturation, hs[1])
      callback()
      const mToK = Math.max(Math.min(Math.round(1000000 / value), 6500), 2700)
      this.cacheCT = Math.round(((mToK - 2700) / 3800) * 255)
      this.cacheHue = 0
      const updateKeyCT = Math.random().toString(36).substr(2, 8)
      this.updateKeyCT = updateKeyCT
      let params
      switch (this.accessory.context.eweUIID) {
        case 59: {
          // *** L1 *** \\
          const newRGB = this.colourUtils.hs2rgb(
            hs[0],
            this.service.getCharacteristic(this.C.Saturation).value
          )
          this.cacheR = newRGB[0]
          this.cacheG = newRGB[1]
          this.cacheB = newRGB[2]
          params = {
            mode: 1,
            colorR: this.cacheR,
            colorG: this.cacheG,
            colorB: this.cacheB
          }
          break
        }
        case 104:
          // *** B02-B-A60, B05-B-A60, GTLC104 *** \\
          params = {
            ltype: this.cacheMode === 'white' ? undefined : 'white',
            white: {
              br: this.cacheBrightness,
              ct: this.cacheCT
            }
          }
          this.cacheMode = 'white'
          break
      }
      await this.helpers.sleep(1500)
      if (updateKeyCT !== this.updateKeyCT) {
        return
      }
      this.updateTimeout = updateKeyCT
      setTimeout(() => {
        if (this.updateTimeout === updateKeyCT) this.updateTimeout = false
      }, 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        if (this.alController && this.alController.isAdaptiveLightingActive()) {
          this.log('[%s] current cct [%sK] via adaptive lighting.', this.accessory.displayName, mToK)
        } else {
          this.log('[%s] current cct [%sK].', this.accessory.displayName, mToK)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.updateTimeout) {
        return
      }
      if (
        (this.isB1 && params.state && params.state !== this.cacheOnOff) ||
        (!this.isB1 && params.switch && params.switch !== this.cacheOnOff)
      ) {
        this.cacheOnOff = this.isB1 ? params.state : params.switch
        this.service.updateCharacteristic(this.C.On, this.cacheOnOff === 'on')
        if (this.isB1) this.service.updateCharacteristic(this.C.Brightness, this.cacheOnOff === 'on' ? 100 : 0)
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.accessory.displayName, this.cacheOnOff)
        }
      }
      let hs
      let mode
      switch (this.accessory.context.eweUIID) {
        case 22:
          // *** B1 *** \\
          if (params.zyx_mode) {
            mode = parseInt(params.zyx_mode)
          } else if (this.helpers.hasProperty(params, 'channel0') && parseInt(params.channel0) + parseInt(params.channel1) > 0) {
            mode = 1
          } else {
            mode = 2
          }
          if (mode === 2) {
            if (this.helpers.hasProperty(params, 'channel2')) {
              if (
                params.channel2 !== (this.cacheR || 0).toString() ||
                params.channel3 !== (this.cacheG || 0).toString() ||
                params.channel4 !== (this.cacheB || 0).toString()
              ) {
                this.cacheR = parseInt(params.channel2)
                this.cacheG = parseInt(params.channel3)
                this.cacheB = parseInt(params.channel4)
                hs = this.colourUtils.rgb2hs(this.cacheR, this.cacheG, this.cacheB)
                this.cacheHue = hs[0]
                this.service.updateCharacteristic(this.C.Hue, this.cacheHue)
                  .updateCharacteristic(this.C.Saturation, 100)
                  .updateCharacteristic(this.C.Brightness, 100)
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log(
                    '[%s] current colour [rgb %s %s %s].',
                    this.accessory.displayName,
                    this.cacheR, this.cacheG, this.cacheB
                  )
                }
              }
            }
          } else {
            if (params.updateSource) {
              this.log('[%s] current mode [white] is unsupported.', this.accessory.displayName)
            }
          }
          break
        case 59:
          // *** L1 *** \\
          if (this.helpers.hasProperty(params, 'bright')) {
            if (params.bright !== this.cacheBrightness) {
              this.cacheBrightness = params.bright
              this.service.updateCharacteristic(this.C.Brightness, this.cacheBrightness)
              if (params.updateSource && !this.disableDeviceLogging) {
                this.log('[%s] current brightness [%s%].', this.accessory.displayName, this.cacheBrightness)
              }
            }
          }
          if (this.helpers.hasProperty(params, 'colorR')) {
            if (params.colorR !== this.cacheR || params.colorG !== this.cacheB || params.colorB !== this.cacheB) {
              this.cacheR = params.colorR
              this.cacheG = params.colorG
              this.cacheB = params.colorB
              hs = this.colourUtils.rgb2hs(this.cacheR, this.cacheG, this.cacheB)
              this.cacheHue = hs[0]
              this.cacheMired = 140
              this.service.updateCharacteristic(this.C.Hue, this.cacheHue)
                .updateCharacteristic(this.C.Saturation, hs[1])
              if (params.updateSource) {
                if (!this.disableDeviceLogging) {
                  this.log(
                    '[%s] current colour [rgb %s %s %s].',
                    this.accessory.displayName,
                    this.cacheR, this.cacheG, this.cacheB
                  )
                }
                if (this.alController && this.alController.isAdaptiveLightingActive()) {
                  this.alController.disableAdaptiveLighting()
                  this.log('[%s] adaptive lighting disabled due to significant colour change.', this.accessory.displayName)
                }
              }
            }
          }
          break
        case 104:
          // *** B02-B-A60, B05-B-A60, GTLC104 *** \\
          if (params.ltype === 'color' && params.color) {
            if (this.helpers.hasProperty(params.color, 'br')) {
              if (params.color.br !== this.cacheBrightness) {
                this.cacheBrightness = params.color.br
                this.service.updateCharacteristic(this.C.Brightness, this.cacheBrightness)
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log('[%s] current brightness [%s%].', this.accessory.displayName, this.cacheBrightness)
                }
              }
            }
            if (this.helpers.hasProperty(params.color, 'r')) {
              if (
                params.color.r !== this.cacheR ||
                params.color.g !== this.cacheG ||
                params.color.b !== this.cacheB ||
                this.cacheMode !== 'color'
              ) {
                this.cacheMode = 'color'
                this.cacheR = params.color.r
                this.cacheG = params.color.g
                this.cacheB = params.color.b
                this.cacheMired = 140
                hs = this.colourUtils.rgb2hs(this.cacheR, this.cacheG, this.cacheB)
                this.cacheHue = hs[0]
                this.service.updateCharacteristic(this.C.ColorTemperature, 140)
                  .updateCharacteristic(this.C.Hue, this.cacheHue)
                  .updateCharacteristic(this.C.Saturation, 100)
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log(
                    '[%s] current colour [rgb %s %s %s].',
                    this.accessory.displayName,
                    this.cacheR, this.cacheG, this.cacheB
                  )
                }
              }
            }
          }
          if (params.ltype === 'white' && params.white) {
            if (this.helpers.hasProperty(params.white, 'br')) {
              if (params.white.br !== this.cacheBrightness || this.cacheMode !== 'white') {
                this.cacheBrightness = params.white.br
                this.service.updateCharacteristic(this.C.Brightness, this.cacheBrightness)
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log('[%s] current brightness [%s%].', this.accessory.displayName, this.cacheBrightness)
                }
              }
            }
            if (this.helpers.hasProperty(params.white, 'ct') && params.white.ct !== this.cacheCT) {
              this.cacheMode = 'white'
              this.cacheCT = params.white.ct
              const ctToK = Math.round(this.cacheCT / 255 * 3800 + 2700)
              this.cacheMired = Math.max(Math.min(Math.round(1000000 / ctToK), 500), 140)
              hs = this.colourUtils.m2hs(this.cacheMired)
              this.cacheHue = hs[0]
              this.service.updateCharacteristic(this.C.Hue, this.cacheHue)
                .updateCharacteristic(this.C.Saturation, hs[1])
                .updateCharacteristic(this.C.ColorTemperature, this.cacheMired)
              if (params.updateSource) {
                if (!this.disableDeviceLogging) {
                  this.log('[%s] current cct [%sK].', this.accessory.displayName, ctToK)
                }
                if (
                  this.alController &&
                  this.alController.isAdaptiveLightingActive() &&
                  Math.abs(params.white.ct - this.cacheCT) > 5
                ) {
                  // *** look for a variation greater than five *** \\
                  this.alController.disableAdaptiveLighting()
                  this.log('[%s] adaptive lighting disabled due to significant colour change.', this.accessory.displayName)
                }
              }
            }
          }
          break
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
