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
    this.accessory = accessory
    if (accessory.context.eweUIID === 104) {
      // HomeKit has a range of 140-500M corresponding to 2000-7143K
      // Devices have a range of 2700K-6500K corresponding to ewelink ct: 0-255
      this.lightService
        .getCharacteristic(this.Characteristic.ColorTemperature)
        .on('set', this.internalCTempUpdate.bind(this))
      if (platform.api.versionGreaterOrEqual && platform.api.versionGreaterOrEqual('1.3.0-beta.27')) {
        this.cacheBrightness = this.lightService.getCharacteristic(this.Characteristic.Brightness).value
        this.alController = new platform.api.hap.AdaptiveLightingController(this.lightService)
        this.accessory.configureController(this.alController)
      }
    }
  }

  async internalOnOffUpdate (value, callback) {
    try {
      callback()
      const params = {}
      const onoff = value ? 'on' : 'off'
      if (onoff === this.cacheOnOff) return
      if (this.accessory.context.eweUIID === 22) {
        params.state = onoff
      } else {
        params.switch = onoff
      }
      this.cacheOnOff = onoff
      const timerKey = Math.random().toString(36).substr(2, 8)
      this.updateTimeout = timerKey
      setTimeout(() => {
        if (this.updateTimeout === timerKey) this.updateTimeout = false
      }, 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.log('[%s] current state [%s].', this.accessory.displayName, onoff)
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
      if (updateKeyBright !== this.updateKeyBright) return
      this.updateTimeout = updateKeyBright
      setTimeout(() => {
        if (this.updateTimeout === updateKeyBright) this.updateTimeout = false
      }, 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.log('[%s] current brightness [%s%].', this.accessory.displayName, value)
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
      this.lightService.updateCharacteristic(this.Characteristic.ColorTemperature, 140)
      callback()
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
          this.cacheR = newRGB[0].toString()
          this.cacheG = newRGB[1].toString()
          this.cacheB = newRGB[2].toString()
          break
        case 59:
          // *** L1 *** \\
          params = {
            mode: 1,
            colorR: newRGB[0],
            colorG: newRGB[1],
            colorB: newRGB[2]
          }
          this.cacheR = newRGB[0]
          this.cacheG = newRGB[1]
          this.cacheB = newRGB[2]
          break
        case 104:
          // *** B02-B-A60, B05-B-A60, GTLC104 *** \\
          params = {
            ltype: this.cacheMode === 'color' ? undefined : 'color',
            color: {
              br: this.cacheBrightness,
              r: newRGB[0],
              g: newRGB[1],
              b: newRGB[2]
            }
          }
          this.cacheMode = 'color'
          this.cacheR = newRGB[0]
          this.cacheG = newRGB[1]
          this.cacheB = newRGB[2]
          break
      }
      await this.helpers.sleep(1500)
      if (updateKeyColour !== this.updateKeyColour) return
      this.updateTimeout = updateKeyColour
      setTimeout(() => {
        if (this.updateTimeout === updateKeyColour) this.updateTimeout = false
      }, 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.log('[%s] current colour [rgb %s, %s, %s].', this.accessory.displayName, this.cacheR, this.cacheG, this.cacheB)
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
      const hs = this.helpers.m2hs(value)
      this.lightService
        .updateCharacteristic(this.Characteristic.Hue, hs[0])
        .updateCharacteristic(this.Characteristic.Saturation, hs[1])
      callback()
      const mToK = Math.max(Math.min(Math.round(1000000 / value), 6500), 2700)
      const kToCT = Math.round(((mToK - 2700) / 3800) * 255)
      this.cacheCT = kToCT
      this.cacheMired = value
      const updateKeyCT = Math.random().toString(36).substr(2, 8)
      this.updateKeyCT = updateKeyCT
      const params = {
        ltype: this.cacheMode === 'white' ? undefined : 'white',
        white: {
          br: this.cacheBrightness,
          ct: kToCT
        }
      }
      this.cacheMode = 'white'
      await this.helpers.sleep(1500)
      if (updateKeyCT !== this.updateKeyCT) return
      this.updateTimeout = updateKeyCT
      setTimeout(() => {
        if (this.updateTimeout === updateKeyCT) this.updateTimeout = false
      }, 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.log('[%s] current cct [%sK].', this.accessory.displayName, mToK)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.updateTimeout) return
      if (
        (this.accessory.context.eweUIID === 22 && params.state && params.state !== this.cacheOnOff) ||
        (this.accessory.context.eweUIID !== 22 && params.switch && params.switch !== this.cacheOnOff)
      ) {
        const newState = this.accessory.context.eweUIID === 22 ? params.state : params.switch
        this.lightService.updateCharacteristic(this.Characteristic.On, newState === 'on')
        if (this.accessory.context.eweUIID === 22) {
          this.lightService.updateCharacteristic(this.Characteristic.Brightness, 100)
        }
        this.cacheOnOff = newState
        if (params.updateSource) this.log('[%s] current state [%s].', this.accessory.displayName, newState)
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
              if (params.channel2 !== this.cacheR || params.channel3 !== this.cacheG || params.channel4 !== this.cacheB) {
                hs = this.helpers.rgb2hs([params.channel2, params.channel3, params.channel4])
                this.lightService
                  .updateCharacteristic(this.Characteristic.Hue, hs[0])
                  .updateCharacteristic(this.Characteristic.Saturation, 100)
                  .updateCharacteristic(this.Characteristic.Brightness, 100)
                this.cacheR = params.channel2
                this.cacheG = params.channel3
                this.cacheB = params.channel4
                this.cacheHue = hs[0]
                if (params.updateSource) {
                  this.log(
                    '[%s] current colour [rgb %s, %s, %s].',
                    this.accessory.displayName,
                    this.cacheR, this.cacheG, this.cacheB
                  )
                }
              }
            }
          } else {
            if (params.updateSource) this.log('[%s] current mode [white] is unsupported.', this.accessory.displayName)
          }
          break
        case 59:
          // *** L1 *** \\
          if (this.helpers.hasProperty(params, 'bright')) {
            if (params.bright !== this.cacheBrightness) {
              this.lightService.updateCharacteristic(this.Characteristic.Brightness, params.bright)
              this.cacheBrightness = params.bright
              if (params.updateSource) this.log('[%s] current brightness [%s%].', this.accessory.displayName, params.bright)
            }
          }
          if (this.helpers.hasProperty(params, 'colorR')) {
            if (params.colorR !== this.cacheR || params.colorG !== this.cacheB || params.colorB !== this.cacheB) {
              hs = this.helpers.rgb2hs([params.colorR, params.colorG, params.colorB])
              this.lightService
                .updateCharacteristic(this.Characteristic.Hue, hs[0])
                .updateCharacteristic(this.Characteristic.Saturation, hs[1])
              this.cacheR = params.colorR
              this.cacheG = params.colorG
              this.cacheB = params.colorB
              this.cacheHue = hs[0]
              if (params.updateSource) {
                this.log(
                  '[%s] current colour [rgb %s, %s, %s].',
                  this.accessory.displayName,
                  this.cacheR, this.cacheG, this.cacheB
                )
              }
            }
          }
          break
        case 104:
          // *** B02-B-A60, B05-B-A60, GTLC104 *** \\
          if (params.ltype === 'color' && params.color) {
            if (this.helpers.hasProperty(params.color, 'br')) {
              if (params.color.br !== this.cacheBrightness) {
                this.lightService.updateCharacteristic(this.Characteristic.Brightness, params.color.br)
                this.cacheBrightness = params.color.br
                if (params.updateSource) this.log('[%s] current brightness [%s%].', this.accessory.displayName, params.color.br)
              }
            }
            if (this.helpers.hasProperty(params.color, 'r')) {
              if (
                params.color.r !== this.cacheR ||
                params.color.g !== this.cacheG ||
                params.color.b !== this.cacheB ||
                params.ltype !== this.cacheMode
              ) {
                hs = this.helpers.rgb2hs([params.color.r, params.color.g, params.color.b])
                this.lightService
                  .updateCharacteristic(this.Characteristic.ColorTemperature, 140)
                  .updateCharacteristic(this.Characteristic.Hue, hs[0])
                  .updateCharacteristic(this.Characteristic.Saturation, 100)
                this.cacheMode = 'color'
                this.cacheR = params.color.r
                this.cacheG = params.color.g
                this.cacheB = params.color.b
                this.cacheHue = hs[0]
                this.cacheMired = 140
                if (params.updateSource) {
                  this.log(
                    '[%s] current colour [rgb %s, %s, %s].',
                    this.accessory.displayName,
                    this.cacheR, this.cacheG, this.cacheB
                  )
                }
              }
            }
          }
          if (params.ltype === 'white' && params.white) {
            if (this.helpers.hasProperty(params.white, 'br')) {
              if (params.white.br !== this.cacheBrightness || params.ltype !== this.cacheMode) {
                this.lightService.updateCharacteristic(this.Characteristic.Brightness, params.white.br)
                this.cacheBrightness = params.white.br
                if (params.updateSource) this.log('[%s] current brightness [%s%].', this.accessory.displayName, params.white.br)
              }
            }
            if (this.helpers.hasProperty(params.white, 'ct')) {
              if (params.white.ct !== this.cacheCT) {
                const ctToK = Math.round(params.white.ct / 255 * 3800 + 2700)
                const kToMired = Math.max(Math.min(Math.round(1000000 / ctToK), 500), 140)
                hs = this.helpers.m2hs(kToMired)
                this.lightService
                  .updateCharacteristic(this.Characteristic.Hue, hs[0])
                  .updateCharacteristic(this.Characteristic.Saturation, hs[1])
                  .updateCharacteristic(this.Characteristic.ColorTemperature, kToMired)
                this.cacheMode = 'white'
                this.cacheCT = params.white.ct
                this.cacheHue = hs[0]
                this.cacheMired = kToMired
                if (params.updateSource) this.log('[%s] current cct [%sK].', this.accessory.displayName, ctToK)
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
