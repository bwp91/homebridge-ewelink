/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceLightCCT {
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
    this.bulbModel = deviceConf && deviceConf.bulbModel
      ? deviceConf.bulbModel
      : platform.consts.defaultValues.bulbModel
    this.alShift = deviceConf && deviceConf.adaptiveLightingShift
      ? deviceConf.adaptiveLightingShift
      : platform.consts.defaultValues.adaptiveLightingShift
    this.brightStep = deviceConf && deviceConf.brightnessStep
      ? Math.min(deviceConf.brightnessStep, 100)
      : platform.consts.defaultValues.brightnessStep
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Different bulbs have different colour temperature ranges
    switch (this.bulbModel) {
      case 'bulbB02FST64':
        this.minK = 1800
        this.maxK = 5000
        break
      case 'bulbB02BA60':
        this.minK = 2700
        this.maxK = 6500
        break
      default:
        this.minK = 2200
        this.maxK = 6500
        break
    }

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

    // Add the set handler to the lightbulb colour temperature characteristic
    this.service.getCharacteristic(this.hapChar.ColorTemperature)
      .on('set', this.internalCTempUpdate.bind(this))

    // Set up the adaptive lighting controller if available
    if (
      platform.api.versionGreaterOrEqual &&
      platform.api.versionGreaterOrEqual('1.3.0')
    ) {
      // This is needed as sometimes we need to send the brightness with a cct update
      this.cacheBrightness = this.service.getCharacteristic(this.hapChar.Brightness).value

      // Set up the adaptive lighting controller
      this.alController = new platform.api.hap.AdaptiveLightingController(
        this.service,
        { customTemperatureAdjustment: this.alShift }
      )
      this.accessory.configureController(this.alController)
    }

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        adaptiveLightingShift: this.alShift,
        brightnessStep: this.brightStep,
        disableDeviceLogging: this.disableDeviceLogging,
        bulbModel: this.bulbModel
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
      const timerKey = Math.random().toString(36).substr(2, 8)
      this.updateTimeout = timerKey
      setTimeout(() => {
        if (this.updateTimeout === timerKey) {
          this.updateTimeout = false
        }
      }, 10000)
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
      const updateKeyBright = Math.random().toString(36).substr(2, 8)
      this.updateKeyBright = updateKeyBright
      const params = {
        white: {
          br: this.cacheBrightness,
          ct: this.cacheCT
        }
      }
      await this.funcs.sleep(500)
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

  async internalCTempUpdate (value, callback) {
    try {
      if (this.cacheMired === value) {
        callback()
        return
      }
      this.cacheMired = value
      callback()
      const kelvin = Math.round(1000000 / this.cacheMired)
      const scaledK = Math.max(Math.min(kelvin, this.maxK), this.minK)
      this.cacheCT = Math.round(((scaledK - this.minK) / (this.maxK - this.minK)) * 255)
      const params = {
        white: {
          br: this.cacheBrightness,
          ct: this.cacheCT
        }
      }
      // For adaptive lighting we still want to update the would have been so
      // it's not disabled when the light comes back on so do this check now not before
      if (this.cacheOnOff !== 'on') {
        return
      }
      const updateKeyCT = Math.random().toString(36).substr(2, 8)
      this.updateKeyCT = updateKeyCT
      this.updateTimeout = updateKeyCT
      await this.funcs.sleep(400)
      if (updateKeyCT !== this.updateKeyCT) {
        return
      }
      setTimeout(() => {
        if (this.updateTimeout === updateKeyCT) {
          this.updateTimeout = false
        }
      }, 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        if (this.alController && this.alController.isAdaptiveLightingActive()) {
          this.log('[%s] current cct [%sK] via adaptive lighting.', this.name, scaledK)
        } else {
          this.log('[%s] current cct [%sK].', this.name, scaledK)
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
      if (params.switch && params.switch !== this.cacheOnOff) {
        this.cacheOnOff = params.switch
        this.service.updateCharacteristic(this.hapChar.On, this.cacheOnOff === 'on')
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
        }
      }
      if (params.white) {
        if (
          this.funcs.hasProperty(params.white, 'br') &&
          this.cacheBrightness !== params.white.br
        ) {
          this.cacheBrightness = params.white.br
          this.service.updateCharacteristic(this.hapChar.Brightness, this.cacheBrightness)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current brightness [%s%].', this.name, this.cacheBrightness)
          }
        }
        if (
          this.funcs.hasProperty(params.white, 'ct') &&
          this.cacheCT !== params.white.ct
        ) {
          const ctDiff = Math.abs(params.white.ct - this.cacheCT)
          this.cacheCT = params.white.ct
          const kelvin = this.cacheCT / 255 * (this.maxK - this.minK) + this.minK
          const scaledK = Math.round(kelvin)
          this.cacheMired = Math.min(Math.max(Math.round(1000000 / scaledK), 140), 500)
          this.service
            .updateCharacteristic(this.hapChar.ColorTemperature, this.cacheMired)
          if (params.updateSource) {
            if (!this.disableDeviceLogging) {
              this.log('[%s] current cct [%sK].', this.name, scaledK)
            }
            if (
              this.alController &&
              this.alController.isAdaptiveLightingActive() &&
              ctDiff > 20
            ) {
              // look for a variation greater than five
              this.alController.disableAdaptiveLighting()
              this.log(
                '[%s] adaptive lighting disabled due to significant colour change.',
                this.name
              )
            }
          }
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
