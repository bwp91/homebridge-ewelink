/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceLightColour {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.colourUtils = platform.colourUtils
    this.consts = platform.consts
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory
    this.isB1 = this.accessory.context.eweUIID === 22

    // Add the lightbulb service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.Lightbulb) ||
      this.accessory.addService(this.hapServ.Lightbulb)

    // Add the set handler to the lightbulb on/off characteristic
    this.service.getCharacteristic(this.hapChar.On)
      .on('set', this.internalOnOffUpdate.bind(this))

    // Add the set handler to the lightbulb brightness characteristic
    this.service.getCharacteristic(this.hapChar.Brightness)
      .on('set', this.internalBrightnessUpdate.bind(this))

    // Add the set handler to the lightbulb hue characteristic
    this.service.getCharacteristic(this.hapChar.Hue)
      .on('set', this.internalColourUpdate.bind(this))

    // Add the set handler to the lightbulb saturation characteristic
    this.service.getCharacteristic(this.hapChar.Saturation)
      .on('set', (value, callback) => callback())

    if (this.isB1) {
      // B1 doesn't support brightness so set a minimum step (ie on or off)
      this.service.getCharacteristic(this.hapChar.Brightness)
        .setProps({ minStep: 100 })
    }

    // Some bulbs support cct with a range of 2700K-6500K corresponding to ewelink 0-255
    if ([59, 104].includes(this.accessory.context.eweUIID)) {
      // Add the set handler to the lightbulb colour temperature characteristic
      this.service.getCharacteristic(this.hapChar.ColorTemperature)
        .on('set', this.internalCTempUpdate.bind(this))

      // Set up the adaptive lighting controller if available
      if (
        platform.api.versionGreaterOrEqual &&
        platform.api.versionGreaterOrEqual('1.3.0-beta.46')
      ) {
        // This is needed as sometimes we need to send the brightness with a cct update
        this.cacheBright = this.service.getCharacteristic(this.hapChar.Brightness).value

        // Set up the adaptive lighting controller
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
        if (this.updateTimeout === timerKey) {
          this.updateTimeout = false
        }
      }, 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalBrightnessUpdate (value, callback) {
    try {
      if (this.cacheBright === value) {
        callback()
        return
      }
      this.cacheBright = value
      callback()
      let params
      const updateKeyBright = Math.random().toString(36).substr(2, 8)
      this.updateKeyBright = updateKeyBright
      switch (this.accessory.context.eweUIID) {
        case 22:
          // B1 doesn't support brightness
          return
        case 59:
          // L1
          params = {
            mode: 1,
            bright: value
          }
          break
        case 104:
          // B02-B-A60, B05-B-A60, GTLC104
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
      await this.funcs.sleep(450)
      if (updateKeyBright !== this.updateKeyBright) {
        return
      }
      this.updateTimeout = updateKeyBright
      setTimeout(() => {
        if (this.updateTimeout === updateKeyBright) {
          this.updateTimeout = false
        }
      }, 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current brightness [%s%].', this.name, value)
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
      this.service.updateCharacteristic(this.hapChar.ColorTemperature, 140)
      callback()
      let params
      const newRGB = this.colourUtils.hs2rgb(value, this.service.getCharacteristic(this.hapChar.Saturation).value)
      this.cacheR = newRGB[0]
      this.cacheG = newRGB[1]
      this.cacheB = newRGB[2]
      this.cacheMired = 0
      this.cacheCT = 0
      const updateKeyColour = Math.random().toString(36).substr(2, 8)
      this.updateKeyColour = updateKeyColour
      switch (this.accessory.context.eweUIID) {
        case 22:
        // B1
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
          // L1
          params = {
            mode: 1,
            colorR: this.cacheR,
            colorG: this.cacheG,
            colorB: this.cacheB
          }
          break
        case 104:
          // B02-B-A60, B05-B-A60, GTLC104
          params = {
            ltype: this.cacheMode === 'color' ? undefined : 'color',
            color: {
              br: this.cacheBright,
              r: this.cacheR,
              g: this.cacheG,
              b: this.cacheB
            }
          }
          this.cacheMode = 'color'
          break
      }
      await this.funcs.sleep(350)
      if (updateKeyColour !== this.updateKeyColour) {
        return
      }
      this.updateTimeout = updateKeyColour
      setTimeout(() => {
        if (this.updateTimeout === updateKeyColour) {
          this.updateTimeout = false
        }
      }, 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current colour [rgb %s %s %s].', this.name, this.cacheR, this.cacheG, this.cacheB)
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
      this.service.updateCharacteristic(this.hapChar.Hue, this.cacheHue)
        .updateCharacteristic(this.hapChar.Saturation, hs[1])
      callback()
      const mToK = Math.max(Math.min(Math.round(1000000 / value), 6500), 2700)
      this.cacheCT = Math.round(((mToK - 2700) / 3800) * 255)
      this.cacheHue = 0
      const updateKeyCT = Math.random().toString(36).substr(2, 8)
      this.updateKeyCT = updateKeyCT
      let params
      switch (this.accessory.context.eweUIID) {
        case 59: {
          // L1
          const newRGB = this.colourUtils.k2rgb(mToK)
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
          // B02-B-A60, B05-B-A60, GTLC104
          params = {
            ltype: this.cacheMode === 'white' ? undefined : 'white',
            white: {
              br: this.cacheBright,
              ct: this.cacheCT
            }
          }
          this.cacheMode = 'white'
          break
      }
      await this.funcs.sleep(350)
      if (updateKeyCT !== this.updateKeyCT) {
        return
      }
      this.updateTimeout = updateKeyCT
      setTimeout(() => {
        if (this.updateTimeout === updateKeyCT) {
          this.updateTimeout = false
        }
      }, 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        if (this.alController && this.alController.isAdaptiveLightingActive()) {
          this.log('[%s] current cct [%sK] via adaptive lighting.', this.name, mToK)
        } else {
          this.log('[%s] current cct [%sK].', this.name, mToK)
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
        this.service.updateCharacteristic(this.hapChar.On, this.cacheOnOff === 'on')
        if (this.isB1) {
          this.service.updateCharacteristic(this.hapChar.Brightness, this.cacheOnOff === 'on' ? 100 : 0)
        }
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
        }
      }
      let hs
      let mode
      switch (this.accessory.context.eweUIID) {
        case 22:
          // B1
          if (params.zyx_mode) {
            mode = parseInt(params.zyx_mode)
          } else if (this.funcs.hasProperty(params, 'channel0') && parseInt(params.channel0) + parseInt(params.channel1) > 0) {
            mode = 1
          } else {
            mode = 2
          }
          if (mode === 2) {
            if (this.funcs.hasProperty(params, 'channel2')) {
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
                this.service.updateCharacteristic(this.hapChar.Hue, this.cacheHue)
                  .updateCharacteristic(this.hapChar.Saturation, 100)
                  .updateCharacteristic(this.hapChar.Brightness, 100)
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log(
                    '[%s] current colour [rgb %s %s %s].',
                    this.name,
                    this.cacheR, this.cacheG, this.cacheB
                  )
                }
              }
            }
          } else {
            if (params.updateSource) {
              this.log('[%s] current mode [white] is unsupported.', this.name)
            }
          }
          break
        case 59:
          // L1
          if (this.funcs.hasProperty(params, 'bright')) {
            if (params.bright !== this.cacheBright) {
              this.cacheBright = params.bright
              this.service.updateCharacteristic(this.hapChar.Brightness, this.cacheBright)
              if (params.updateSource && !this.disableDeviceLogging) {
                this.log('[%s] current brightness [%s%].', this.name, this.cacheBright)
              }
            }
          }
          if (this.funcs.hasProperty(params, 'colorR')) {
            if (params.colorR !== this.cacheR || params.colorG !== this.cacheB || params.colorB !== this.cacheB) {
              this.cacheR = params.colorR
              this.cacheG = params.colorG
              this.cacheB = params.colorB
              hs = this.colourUtils.rgb2hs(this.cacheR, this.cacheG, this.cacheB)
              this.cacheHue = hs[0]
              this.cacheMired = 140
              this.service.updateCharacteristic(this.hapChar.Hue, this.cacheHue)
                .updateCharacteristic(this.hapChar.Saturation, hs[1])
              if (params.updateSource) {
                if (!this.disableDeviceLogging) {
                  this.log(
                    '[%s] current colour [rgb %s %s %s].',
                    this.name,
                    this.cacheR, this.cacheG, this.cacheB
                  )
                }
                if (this.alController && this.alController.isAdaptiveLightingActive()) {
                  this.alController.disableAdaptiveLighting()
                  this.log('[%s] adaptive lighting disabled due to significant colour change.', this.name)
                }
              }
            }
          }
          break
        case 104:
          // B02-B-A60, B05-B-A60, GTLC104
          if (params.ltype === 'color' && params.color) {
            if (this.funcs.hasProperty(params.color, 'br')) {
              if (params.color.br !== this.cacheBright) {
                this.cacheBright = params.color.br
                this.service.updateCharacteristic(this.hapChar.Brightness, this.cacheBright)
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log('[%s] current brightness [%s%].', this.name, this.cacheBright)
                }
              }
            }
            if (this.funcs.hasProperty(params.color, 'r')) {
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
                this.service.updateCharacteristic(this.hapChar.ColorTemperature, 140)
                  .updateCharacteristic(this.hapChar.Hue, this.cacheHue)
                  .updateCharacteristic(this.hapChar.Saturation, 100)
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log(
                    '[%s] current colour [rgb %s %s %s].',
                    this.name,
                    this.cacheR, this.cacheG, this.cacheB
                  )
                }
              }
            }
          }
          if (params.ltype === 'white' && params.white) {
            if (this.funcs.hasProperty(params.white, 'br')) {
              if (params.white.br !== this.cacheBright || this.cacheMode !== 'white') {
                this.cacheBright = params.white.br
                this.service.updateCharacteristic(this.hapChar.Brightness, this.cacheBright)
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log('[%s] current brightness [%s%].', this.name, this.cacheBright)
                }
              }
            }
            if (this.funcs.hasProperty(params.white, 'ct') && params.white.ct !== this.cacheCT) {
              this.cacheMode = 'white'
              this.cacheCT = params.white.ct
              const ctToK = Math.round(this.cacheCT / 255 * 3800 + 2700)
              this.cacheMired = Math.max(Math.min(Math.round(1000000 / ctToK), 500), 140)
              hs = this.colourUtils.m2hs(this.cacheMired)
              this.cacheHue = hs[0]
              this.service.updateCharacteristic(this.hapChar.Hue, this.cacheHue)
                .updateCharacteristic(this.hapChar.Saturation, hs[1])
                .updateCharacteristic(this.hapChar.ColorTemperature, this.cacheMired)
              if (params.updateSource) {
                if (!this.disableDeviceLogging) {
                  this.log('[%s] current cct [%sK].', this.name, ctToK)
                }
                if (
                  this.alController &&
                  this.alController.isAdaptiveLightingActive() &&
                  Math.abs(params.white.ct - this.cacheCT) > 5
                ) {
                  // look for a variation greater than five
                  this.alController.disableAdaptiveLighting()
                  this.log('[%s] adaptive lighting disabled due to significant colour change.', this.name)
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
