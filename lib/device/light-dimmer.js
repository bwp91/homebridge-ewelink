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
    this.service.getCharacteristic(this.hapChar.On)
      .on('set', this.internalOnOffUpdate.bind(this))

    // Add the set handler to the lightbulb brightness characteristic
    this.service.getCharacteristic(this.hapChar.Brightness)
      .on('set', this.internalBrightnessUpdate.bind(this))
      .setProps({ minStep: this.brightStep })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        brightnessStep: this.brightStep,
        disableDeviceLogging: this.disableDeviceLogging
      })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async internalOnOffUpdate (value, callback) {
    try {
      callback()
      const onoff = value ? 'on' : 'off'
      if (this.cacheOnOff === onoff) {
        return
      }
      this.cacheOnOff = onoff
      await this.platform.sendDeviceUpdate(this.accessory, {
        switch: this.cacheOnOff
      })
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
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
      const params = {}
      switch (this.accessory.context.eweUIID) {
        case 36:
        // KING-M4 eWeLink scale is 10-100 and HomeKit scale is 0-100.
          params.bright = Math.round((this.cacheBrightness * 9) / 10 + 10)
          break
        case 44:
        // D1 eWeLink scale matches HomeKit scale of 0-100
          params.brightness = this.cacheBrightness
          params.mode = 0
          break
      }
      const updateKey = Math.random().toString(36).substr(2, 8)
      this.updateKeyBright = updateKey
      await this.funcs.sleep(500)
      if (updateKey !== this.updateKeyBright) {
        return
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current brightness [%s%].', this.name, this.cacheBrightness)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (params.switch && params.switch !== this.cacheOnOff) {
        this.service.updateCharacteristic(this.hapChar.On, params.switch === 'on')
        this.cacheOnOff = params.switch
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.name, params.switch)
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
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
