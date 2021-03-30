/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceLightRGBCCT {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.colourUtils = platform.colourUtils
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.lightDevices[deviceId]
    this.alShift = deviceConf && deviceConf.adaptiveLightingShift
      ? deviceConf.adaptiveLightingShift
      : platform.consts.defaultValues.adaptiveLightingShift
    this.brightStep = deviceConf && deviceConf.brightnessStep
      ? Math.min(deviceConf.brightnessStep, 100)
      : platform.consts.defaultValues.brightnessStep
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // If the accessory has a outlet service then remove it (remedies bug int in v5)
    if (this.accessory.getService(this.hapServ.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
    }

    // Add the lightbulb service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.Lightbulb) ||
      this.accessory.addService(this.hapServ.Lightbulb)

    // Add the set handler to the lightbulb on/off characteristic
    this.service.getCharacteristic(this.hapChar.On).onSet(async value => {
      await this.internalOnOffUpdate(value)
    })

    // Add the set handler to the lightbulb brightness characteristic
    this.service.getCharacteristic(this.hapChar.Brightness)
      .setProps({ minStep: this.brightStep })
      .onSet(async value => {
        await this.internalBrightnessUpdate(value)
      })

    // Add the set handler to the lightbulb hue characteristic
    this.service.getCharacteristic(this.hapChar.Hue).onSet(async value => {
      await this.internalColourUpdate(value)
    })

    // Add the set handler to the lightbulb colour temperature characteristic
    this.service.getCharacteristic(this.hapChar.ColorTemperature).onSet(async value => {
      await this.internalCTempUpdate(value)
    })

    // This is needed as sometimes we need to send the brightness with a cct update
    this.cacheBright = this.service.getCharacteristic(this.hapChar.Brightness).value

    // Set up the adaptive lighting controller
    this.alController = new platform.api.hap.AdaptiveLightingController(
      this.service,
      { customTemperatureAdjustment: this.alShift }
    )
    this.accessory.configureController(this.alController)

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        adaptiveLightingShift: this.alShift,
        brightnessStep: this.brightStep,
        disableDeviceLogging: this.disableDeviceLogging
      })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async internalOnOffUpdate (value) {
    try {
      const newValue = value ? 'on' : 'off'
      if (this.cacheOnOff === newValue) {
        return
      }
      const timerKey = Math.random().toString(36).substr(2, 8)
      this.updateTimeout = timerKey
      setTimeout(() => {
        if (this.updateTimeout === timerKey) {
          this.updateTimeout = false
        }
      }, 5000)
      const params = { switch: newValue }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheOnOff = newValue
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, this.cacheOnOff === 'on')
      }, 5000)
      throw new this.platform.api.hap.HapStatusError(-70402)
    }
  }

  async internalBrightnessUpdate (value) {
    try {
      if (this.cacheBright === value) {
        return
      }
      let params
      const updateKeyBright = Math.random().toString(36).substr(2, 8)
      this.updateKeyBright = updateKeyBright
      await this.funcs.sleep(500)
      if (updateKeyBright !== this.updateKeyBright) {
        return
      }
      this.updateTimeout = updateKeyBright
      setTimeout(() => {
        if (this.updateTimeout === updateKeyBright) {
          this.updateTimeout = false
        }
      }, 5000)
      switch (this.accessory.context.eweUIID) {
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
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheBright = value
      if (!this.disableDeviceLogging) {
        this.log('[%s] current brightness [%s%].', this.name, value)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, this.cacheOnOff === 'on')
      }, 5000)
      throw new this.platform.api.hap.HapStatusError(-70402)
    }
  }

  async internalColourUpdate (value) {
    try {
      if (this.cacheHue === value || this.cacheOnOff !== 'on') {
        return
      }
      const updateKeyColour = Math.random().toString(36).substr(2, 8)
      this.updateKeyColour = updateKeyColour
      await this.funcs.sleep(400)
      if (updateKeyColour !== this.updateKeyColour) {
        return
      }
      this.updateTimeout = updateKeyColour
      setTimeout(() => {
        if (this.updateTimeout === updateKeyColour) {
          this.updateTimeout = false
        }
      }, 5000)
      this.service.updateCharacteristic(this.hapChar.ColorTemperature, 140)
      let params
      const sat = this.service.getCharacteristic(this.hapChar.Saturation).value
      const rgb = this.colourUtils.hs2rgb(value, sat)
      switch (this.accessory.context.eweUIID) {
        case 59:
          // L1
          params = {
            mode: 1,
            colorR: rgb[0],
            colorG: rgb[1],
            colorB: rgb[2]
          }
          break
        case 104:
          // B02-B-A60, B05-B-A60, GTLC104
          params = {
            ltype: this.cacheMode === 'color' ? undefined : 'color',
            color: {
              br: this.cacheBright,
              r: rgb[0],
              g: rgb[1],
              b: rgb[2]
            }
          }
          break
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheHue = value
      this.cacheR = rgb[0]
      this.cacheG = rgb[1]
      this.cacheB = rgb[2]
      this.cacheMired = 0
      this.cacheCT = 0
      if (this.accessory.context.eweUIID === 104) {
        this.cacheMode = 'color'
      }
      if (!this.disableDeviceLogging) {
        this.log(
          '[%s] current colour [rgb %s %s %s].',
          this.name,
          this.cacheR,
          this.cacheG,
          this.cacheB
        )
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, this.cacheOnOff === 'on')
      }, 5000)
      throw new this.platform.api.hap.HapStatusError(-70402)
    }
  }

  async internalCTempUpdate (value) {
    try {
      if (this.cacheMired === value || this.cacheOnOff !== 'on') {
        return
      }
      const updateKeyCT = Math.random().toString(36).substr(2, 8)
      this.updateKeyCT = updateKeyCT
      await this.funcs.sleep(400)
      if (updateKeyCT !== this.updateKeyCT) {
        return
      }
      this.updateTimeout = updateKeyCT
      setTimeout(() => {
        if (this.updateTimeout === updateKeyCT) {
          this.updateTimeout = false
        }
      }, 5000)
      const hs = this.colourUtils.m2hs(value)
      this.service.updateCharacteristic(this.hapChar.Hue, hs[0])
      this.service.updateCharacteristic(this.hapChar.Saturation, hs[1])
      const mToK = Math.max(Math.min(Math.round(1000000 / value), 6500), 2700)
      const scaledCT = Math.round(((mToK - 2700) / 3800) * 255)
      let params
      let newRGB
      switch (this.accessory.context.eweUIID) {
        case 59: {
          // L1
          newRGB = this.colourUtils.k2rgb(mToK)
          params = {
            mode: 1,
            colorR: newRGB[0],
            colorG: newRGB[1],
            colorB: newRGB[2]
          }
          break
        }
        case 104:
          // B02-B-A60, B05-B-A60, GTLC104
          params = {
            ltype: this.cacheMode === 'white' ? undefined : 'white',
            white: {
              br: this.cacheBright,
              ct: scaledCT
            }
          }
          break
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheMired = value
      this.cacheHue = hs[0]
      this.cacheCT = scaledCT
      this.cacheHue = 0
      switch (this.accessory.context.eweUIID) {
        case 59: {
          // L1
          this.cacheR = newRGB[0]
          this.cacheG = newRGB[1]
          this.cacheB = newRGB[2]
          break
        }
        case 104:
          this.cacheMode = 'white'
          break
      }
      if (!this.disableDeviceLogging) {
        if (this.alController.isAdaptiveLightingActive()) {
          this.log('[%s] current cct [%sK] via adaptive lighting.', this.name, mToK)
        } else {
          this.log('[%s] current cct [%sK].', this.name, mToK)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, this.cacheOnOff === 'on')
      }, 5000)
      throw new this.platform.api.hap.HapStatusError(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.updateTimeout) {
        return
      }
      if (params.switch && params.switch !== this.cacheOnOff) {
        this.cacheOnOff = params.switch
        this.service.updateCharacteristic(this.hapChar.On, this.cacheOnOff === 'on')
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
        }
      }
      let hs
      switch (this.accessory.context.eweUIID) {
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
            if (
              params.colorR !== this.cacheR ||
              params.colorG !== this.cacheB ||
              params.colorB !== this.cacheB
            ) {
              const rgbDiff = Math.abs(params.colorR - this.cacheR) +
                Math.abs(params.colorG - this.cacheG) +
                Math.abs(params.colorG - this.cacheB)
              this.cacheR = params.colorR
              this.cacheG = params.colorG
              this.cacheB = params.colorB
              hs = this.colourUtils.rgb2hs(this.cacheR, this.cacheG, this.cacheB)
              this.cacheHue = hs[0]
              this.cacheMired = 140
              this.service.updateCharacteristic(this.hapChar.Hue, this.cacheHue)
              this.service.updateCharacteristic(this.hapChar.Saturation, hs[1])
              if (params.updateSource) {
                if (!this.disableDeviceLogging) {
                  this.log(
                    '[%s] current colour [rgb %s %s %s].',
                    this.name,
                    this.cacheR, this.cacheG, this.cacheB
                  )
                }
                if (this.alController.isAdaptiveLightingActive() && rgbDiff > 50) {
                  this.alController.disableAdaptiveLighting()
                  this.log(
                    '[%s] adaptive lighting disabled due to significant colour change.',
                    this.name
                  )
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
                this.service
                  .updateCharacteristic(this.hapChar.Brightness, this.cacheBright)
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
            if (params.updateSource && this.alController.isAdaptiveLightingActive()) {
              this.alController.disableAdaptiveLighting()
              this.log(
                '[%s] adaptive lighting disabled due to significant colour change.',
                this.name
              )
            }
          }
          if (params.ltype === 'white' && params.white) {
            if (this.funcs.hasProperty(params.white, 'br')) {
              if (params.white.br !== this.cacheBright || this.cacheMode !== 'white') {
                this.cacheBright = params.white.br
                this.service
                  .updateCharacteristic(this.hapChar.Brightness, this.cacheBright)
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log('[%s] current brightness [%s%].', this.name, this.cacheBright)
                }
              }
            }
            if (
              this.funcs.hasProperty(params.white, 'ct') &&
              params.white.ct !== this.cacheCT
            ) {
              this.cacheMode = 'white'
              const ctDiff = Math.abs(params.white.ct - this.cacheCT)
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
                if (this.alController.isAdaptiveLightingActive() && ctDiff > 20) {
                  // look for a variation greater than twenty
                  this.alController.disableAdaptiveLighting()
                  this.log(
                    '[%s] adaptive lighting disabled due to significant colour change.',
                    this.name
                  )
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
