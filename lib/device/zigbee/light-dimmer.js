/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceZBLightDimmer {
  constructor (platform, accessory) {
    // Set up variables from the platform
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
    this.brightStep = deviceConf && deviceConf.brightnessStep
      ? Math.min(deviceConf.brightnessStep, 100)
      : platform.consts.defaultValues.brightnessStep
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Add the lightbulb service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.Lightbulb) ||
      this.accessory.addService(this.hapServ.Lightbulb)

    // Add the get/set handler to the lightbulb on/off characteristic
    this.service.getCharacteristic(this.hapChar.On)
      .onGet(() => {
        if (this.isOnline) {
          return this.service.getCharacteristic(this.hapChar.On).value
        } else {
          throw new this.hapErr(-70402)
        }
      })
      .onSet(async value => {
        await this.internalStateUpdate(value)
      })

    // Add the set handler to the lightbulb brightness characteristic
    this.service.getCharacteristic(this.hapChar.Brightness)
      .setProps({ minStep: this.brightStep })
      .onSet(async value => {
        await this.internalBrightnessUpdate(value)
      })

    // Output the customised options to the log if in debug mode
    if (platform.config.debug) {
      const opts = JSON.stringify({
        brightnessStep: this.brightStep,
        disableDeviceLogging: this.disableDeviceLogging
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async internalStateUpdate (value) {
    try {
      const newValue = value ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, {
        switch: newValue
      })
      this.cacheState = newValue
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async internalBrightnessUpdate (value) {
    try {
      if (this.cacheBright === value || value === 0) {
        return
      }
      const updateKey = Math.random().toString(36).substr(2, 8)
      this.updateKey = updateKey
      await this.funcs.sleep(500)
      if (updateKey !== this.updateKey) {
        return
      }
      const params = {
        switch: 'on',
        brightness: value
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheBright = value
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s%].', this.name, this.lang.curBright, this.cacheBright)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.Brightness, this.cacheBright)
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (params.switch && params.switch !== this.cacheState) {
        this.cacheState = params.switch
        this.service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
        }
      }
      if (this.funcs.hasProperty(params, 'brightness')) {
        if (params.brightness !== this.cacheBright) {
          this.cacheBright = params.brightness
          this.service.updateCharacteristic(this.hapChar.Brightness, this.cacheBright)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] %s [%s%].', this.name, this.lang.curBright, this.cacheBright)
          }
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
