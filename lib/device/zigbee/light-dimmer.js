/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceZBLightDimmer {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
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
  }

  async internalOnOffUpdate (value, callback) {
    try {
      callback()
      await this.platform.sendDeviceUpdate(this.accessory, {
        switch: value ? 'on' : 'off'
      })
      this.cacheOnOff = value ? 'on' : 'off'
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, value ? 'on' : 'off')
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalBrightnessUpdate (value, callback) {
    try {
      if (this.cacheBrightness === value || value === 0) {
        callback()
        return
      }
      this.cacheBrightness = value
      callback()
      const params = {
        switch: 'on',
        brightness: this.cacheBrightness
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
        this.cacheOnOff = params.switch
        this.service.updateCharacteristic(this.hapChar.On, this.cacheOnOff === 'on')
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
        }
      }
      if (this.funcs.hasProperty(params, 'brightness')) {
        if (params.brightness !== this.cacheBrightness) {
          this.cacheBrightness = params.brightness
          this.service.updateCharacteristic(this.hapChar.Brightness, this.cacheBrightness)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current brightness [%s%].', this.name, this.cacheBrightness)
          }
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
