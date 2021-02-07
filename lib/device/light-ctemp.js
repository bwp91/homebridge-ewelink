/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceLightColour {
  constructor (platform, accessory) {
    // Set up variables from the platform
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

    this.service = this.accessory.getService(this.hapServ.Lightbulb) || this.accessory.addService(this.hapServ.Lightbulb)
    this.service.getCharacteristic(this.hapChar.On)
      .on('set', this.internalOnOffUpdate.bind(this))
    this.service.getCharacteristic(this.hapChar.Brightness)
      .on('set', this.internalBrightnessUpdate.bind(this))
    this.service.getCharacteristic(this.hapChar.ColorTemperature)
      .on('set', this.internalCTempUpdate.bind(this))
    if ((this.platform.config.bulbB02FST64 || '').split(',').includes(this.accessory.context.eweDeviceId)) {
      this.minK = 1800
      this.maxK = 5000
    } else if ((this.platform.config.bulbB02BA60 || '').split(',').includes(this.accessory.context.eweDeviceId)) {
      this.minK = 2700
      this.maxK = 6500
    } else {
      this.minK = 2200
      this.maxK = 6500
    }
    if (platform.api.versionGreaterOrEqual && platform.api.versionGreaterOrEqual('1.3.0-beta.46')) {
      this.cacheBrightness = this.service.getCharacteristic(this.hapChar.Brightness).value
      this.alController = new platform.api.hap.AdaptiveLightingController(this.service)
      this.accessory.configureController(this.alController)
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

  async internalCTempUpdate (value, callback) {
    try {
      if (this.cacheOnOff !== 'on' || this.cacheMired === value) {
        callback()
        return
      }
      this.cacheMired = value
      callback()
      const mToK = Math.max(Math.min(Math.round(1000000 / this.cacheMired), this.maxK), this.minK)
      this.cacheCT = Math.round(((mToK - this.minK) / (this.maxK - this.minK)) * 255)
      const updateKeyCT = Math.random().toString(36).substr(2, 8)
      this.updateKeyCT = updateKeyCT
      const params = {
        white: {
          br: this.cacheBrightness,
          ct: this.cacheCT
        }
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
      if (params.switch && params.switch !== this.cacheOnOff) {
        this.cacheOnOff = params.switch
        this.service.updateCharacteristic(this.hapChar.On, this.cacheOnOff === 'on')
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
        }
      }
      if (params.white) {
        if (this.funcs.hasProperty(params.white, 'br') && this.cacheBrightness !== params.white.br) {
          this.cacheBrightness = params.white.br
          this.service.updateCharacteristic(this.hapChar.Brightness, this.cacheBrightness)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current brightness [%s%].', this.name, this.cacheBrightness)
          }
        }
        if (this.funcs.hasProperty(params.white, 'ct') && this.cacheCT !== params.white.ct) {
          this.cacheCT = params.white.ct
          const ctToK = Math.round(this.cacheCT / 255 * (this.maxK - this.minK) + this.minK)
          this.cacheMired = Math.min(Math.max(Math.round(1000000 / ctToK), 140), 500)
          this.service.updateCharacteristic(this.hapChar.ColorTemperature, this.cacheMired)
          if (params.updateSource) {
            if (!this.disableDeviceLogging) {
              this.log('[%s] current cct [%sK].', this.name, ctToK)
            }
            if (
              this.alController &&
              this.alController.isAdaptiveLightingActive() &&
              Math.abs(params.white.ct - this.cacheCT) > 5
            ) {
              // *** look for a variation greater than five *** \\
              this.alController.disableAdaptiveLighting()
              this.log('[%s] adaptive lighting disabled due to significant colour change.', this.name)
            }
          }
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
