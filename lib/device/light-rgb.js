/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceLightRGB {
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
    this.isB1 = this.accessory.context.eweUIID === 22

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

    // Add the lightbulb service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.Lightbulb) ||
      this.accessory.addService(this.hapServ.Lightbulb)

    // Add the set handler to the lightbulb on/off characteristic
    this.service.getCharacteristic(this.hapChar.On)
      .on('set', this.internalOnOffUpdate.bind(this))

    // Add the set handler to the lightbulb brightness characteristic
    this.service.getCharacteristic(this.hapChar.Brightness)
      .on('set', this.internalBrightnessUpdate.bind(this))

    // B1 doesn't support brightness so set a minimum step (ie on or off)
    this.service.getCharacteristic(this.hapChar.Brightness)
      .setProps({ minStep: 100 })

    // Add the set handler to the lightbulb hue characteristic
    this.service.getCharacteristic(this.hapChar.Hue)
      .on('set', this.internalColourUpdate.bind(this))

    // Add the set handler to the lightbulb saturation characteristic
    this.service.getCharacteristic(this.hapChar.Saturation)
      .on('set', (value, callback) => callback())

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({ disableDeviceLogging: this.disableDeviceLogging })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
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
      params.state = this.cacheOnOff
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
      this.cacheBright = value
      callback()
      // B1 doesn't support brightness
      return
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalColourUpdate (value, callback) {
    try {
      if (this.cacheHue === value) {
        callback()
        return
      }
      this.cacheHue = value
      this.service.updateCharacteristic(this.hapChar.ColorTemperature, 140)
      callback()
      const saturation = this.service.getCharacteristic(this.hapChar.Saturation).value
      const newRGB = this.colourUtils.hs2rgb(value, saturation)
      this.cacheR = newRGB[0]
      this.cacheG = newRGB[1]
      this.cacheB = newRGB[2]
      const params = {
        zyx_mode: 2,
        type: 'middle',
        channel0: '0',
        channel1: '0',
        channel2: this.cacheR.toString(),
        channel3: this.cacheG.toString(),
        channel4: this.cacheB.toString()
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
      }, 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
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
    }
  }

  async externalUpdate (params) {
    try {
      if (this.updateTimeout) {
        return
      }
      if (params.state && params.state !== this.cacheOnOff) {
        this.cacheOnOff = params.state
        this.service.updateCharacteristic(this.hapChar.On, this.cacheOnOff === 'on')
        this.service.updateCharacteristic(
          this.hapChar.Brightness,
          this.cacheOnOff === 'on' ? 100 : 0
        )
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
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
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
