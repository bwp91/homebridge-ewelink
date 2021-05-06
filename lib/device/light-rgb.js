/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceLightRGB {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.colourUtils = platform.colourUtils
    this.funcs = platform.funcs
    this.hapChar = platform.api.hap.Characteristic
    this.hapErr = platform.api.hap.HapStatusError
    this.hapServ = platform.api.hap.Service
    this.lang = platform.lang
    this.log = platform.log
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceConf = platform.lightDevices[accessory.context.eweDeviceId]
    this.alShift = deviceConf && deviceConf.adaptiveLightingShift
      ? deviceConf.adaptiveLightingShift
      : platform.consts.defaultValues.adaptiveLightingShift
    this.brightStep = deviceConf && deviceConf.brightnessStep
      ? Math.min(deviceConf.brightnessStep, 100)
      : platform.consts.defaultValues.brightnessStep
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Add the lightbulb service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.Lightbulb) ||
      this.accessory.addService(this.hapServ.Lightbulb)

    // Add the set handler to the lightbulb on/off characteristic
    this.service.getCharacteristic(this.hapChar.On).onSet(async value => {
      await this.internalStateUpdate(value)
    })

    // Add the set handler to the lightbulb brightness characteristic
    this.service.getCharacteristic(this.hapChar.Brightness)
      .setProps({ minStep: 100 })
      .onSet(async value => {
        await this.internalBrightnessUpdate(value)
      })

    // Add the set handler to the lightbulb hue characteristic
    this.service.getCharacteristic(this.hapChar.Hue).onSet(async value => {
      await this.internalColourUpdate(value)
    })

    // Output the customised options to the log if in debug mode
    if (platform.config.debug) {
      const opts = JSON.stringify({ disableDeviceLogging: this.disableDeviceLogging })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async internalStateUpdate (value) {
    try {
      const params = {}
      const newValue = value ? 'on' : 'off'
      if (this.cacheState === newValue) {
        return
      }
      params.state = newValue
      const timerKey = Math.random().toString(36).substr(2, 8)
      this.updateTimeout = timerKey
      setTimeout(() => {
        if (this.updateTimeout === timerKey) {
          this.updateTimeout = false
        }
      }, 5000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheState = newValue
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')
      }, 5000)
      throw new this.hapErr(-70402)
    }
  }

  async internalBrightnessUpdate (value) {
    try {
      // B1 doesn't support brightness
      this.cacheBright = value
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')
      }, 5000)
      throw new this.hapErr(-70402)
    }
  }

  async internalColourUpdate (value) {
    try {
      if (this.cacheHue === value) {
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
      const saturation = this.service.getCharacteristic(this.hapChar.Saturation).value
      const newRGB = this.colourUtils.hs2rgb(value, saturation)
      const params = {
        zyx_mode: 2,
        type: 'middle',
        channel0: '0',
        channel1: '0',
        channel2: newRGB[0].toString(),
        channel3: newRGB[1].toString(),
        channel4: newRGB[2].toString()
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheHue = value
      this.cacheR = newRGB[0]
      this.cacheG = newRGB[1]
      this.cacheB = newRGB[2]
      if (!this.disableDeviceLogging) {
        this.log(
          '[%s] %s [rgb %s].',
          this.name,
          this.lang.curColour,
          this.cacheR + ' ' + this.cacheG + ' ' + this.cacheB
        )
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')
      }, 5000)
      throw new this.hapErr(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.updateTimeout) {
        return
      }
      if (params.state && params.state !== this.cacheState) {
        this.cacheState = params.state
        this.service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')
        this.service.updateCharacteristic(
          this.hapChar.Brightness,
          this.cacheState === 'on' ? 100 : 0
        )
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
        }
      }
      let hs
      let mode
      if (params.zyx_mode) {
        mode = parseInt(params.zyx_mode)
      } else if (
        this.funcs.hasProperty(params, 'channel0') &&
        parseInt(params.channel0) + parseInt(params.channel1) > 0
      ) {
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
            this.service.updateCharacteristic(this.hapChar.Saturation, 100)
            this.service.updateCharacteristic(this.hapChar.Brightness, 100)
            if (params.updateSource && !this.disableDeviceLogging) {
              this.log(
                '[%s] %s [rgb %s].',
                this.name,
                this.lang.curColour,
                this.cacheR + ' ' + this.cacheG + ' ' + this.cacheB
              )
            }
          }
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  currentState () {
    const toReturn = {}
    toReturn.services = ['light']
    toReturn.light = {
      state: this.service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off',
      brightness: this.service.getCharacteristic(this.hapChar.Brightness).value,
      hue: this.service.getCharacteristic(this.hapChar.Hue).value,
      saturation: this.service.getCharacteristic(this.hapChar.Saturation).value
    }
    return toReturn
  }
}
