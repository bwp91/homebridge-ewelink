/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceLightDimmer {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.lightDevices[deviceId]
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
      await this.internalOnOffUpdate(value)
    })

    // Add the set handler to the lightbulb brightness characteristic
    this.service.getCharacteristic(this.hapChar.Brightness)
      .setProps({ minStep: this.brightStep })
      .onSet(async value => {
        await this.internalBrightnessUpdate(value)
      })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
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
      const params = {}
      switch (this.accessory.context.eweUIID) {
        case 36:
        case 44:
          // KING-M4, D1
          params.switch = newValue
          break
        case 57:
          params.state = newValue
          break
      }
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
      if (this.cacheBrightness === value) {
        return
      }
      const params = {}
      switch (this.accessory.context.eweUIID) {
        case 36:
          params.bright = Math.round((value * 9) / 10 + 10)
          // KING-M4 eWeLink scale is 10-100 and HomeKit scale is 0-100
          break
        case 44:
          params.brightness = value
          // D1 eWeLink scale matches HomeKit scale of 0-100
          params.mode = 0
          break
        case 57:
          params.channel0 = Math.round((value * 23) / 10 + 25).toString()
          // Device eWeLink scale is 25-255 and HomeKit scale is 0-100.
          break
      }
      const updateKey = Math.random().toString(36).substr(2, 8)
      this.updateKeyBright = updateKey
      await this.funcs.sleep(500)
      if (updateKey !== this.updateKeyBright) {
        return
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheBrightness = value
      if (!this.disableDeviceLogging) {
        this.log('[%s] current brightness [%s%].', this.name, this.cacheBrightness)
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
      if (this.accessory.context.eweUIID === 57) {
        if (params.state && params.state !== this.cacheOnOff) {
          this.service.updateCharacteristic(this.hapChar.On, params.state === 'on')
          this.cacheOnOff = params.state
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current state [%s].', this.name, params.state)
          }
        }
      } else {
        if (params.switch && params.switch !== this.cacheOnOff) {
          this.service.updateCharacteristic(this.hapChar.On, params.switch === 'on')
          this.cacheOnOff = params.switch
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current state [%s].', this.name, params.switch)
          }
        }
      }

      switch (this.accessory.context.eweUIID) {
        case 36:
          // KING-M4 eWeLink scale is 10-100 and HomeKit scale is 0-100.
          if (this.funcs.hasProperty(params, 'bright')) {
            const nb = Math.round(((params.bright - 10) * 10) / 9)
            if (nb !== this.cacheBrightness) {
              this.service.updateCharacteristic(this.hapChar.Brightness, nb)
              this.cacheBrightness = nb
              if (params.updateSource && !this.disableDeviceLogging) {
                this.log('[%s] current brightness [%s%].', this.name, nb)
              }
            }
          }
          break
        case 44:
          // D1 eWeLink scale matches HomeKit scale of 0-100
          if (this.funcs.hasProperty(params, 'brightness')) {
            if (params.brightness !== this.cacheBrightness) {
              this.service
                .updateCharacteristic(this.hapChar.Brightness, params.brightness)
              this.cacheBrightness = params.brightness
              if (params.updateSource && !this.disableDeviceLogging) {
                this.log('[%s] current brightness [%s%].', this.name, params.brightness)
              }
            }
          }
          break
        case 57:
          // Device eWeLink scale is 25-255 and HomeKit scale is 0-100.
          if (this.funcs.hasProperty(params, 'channel0')) {
            const nb = Math.round(((parseInt(params.channel0) - 25) * 10) / 23)
            if (nb !== this.cacheBrightness) {
              this.service.updateCharacteristic(this.hapChar.Brightness, nb)
              this.cacheBrightness = nb
              if (params.updateSource && !this.disableDeviceLogging) {
                this.log('[%s] current brightness [%s%].', this.name, nb)
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
