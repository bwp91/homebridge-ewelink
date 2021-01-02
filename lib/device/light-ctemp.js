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
      .getCharacteristic(this.Characteristic.ColorTemperature)
      .on('set', this.internalCTempUpdate.bind(this))
    if ((this.platform.config.bulbB02FST64 || '').split(',').includes(accessory.context.eweDeviceId)) {
      this.minK = 1800
      this.maxK = 5000
    } else {
      this.minK = 2200
      this.maxK = 6500
    }
    this.accessory = accessory
    if (platform.api.versionGreaterOrEqual && platform.api.versionGreaterOrEqual('1.3.0-beta.40')) {
      this.cacheBrightness = this.lightService.getCharacteristic(this.Characteristic.Brightness).value
      this.alController = new platform.api.hap.AdaptiveLightingController(this.lightService)
      this.accessory.configureController(this.alController)
    }
  }

  async internalOnOffUpdate (value, callback) {
    try {
      callback()
      const onoff = value ? 'on' : 'off'
      if (this.cacheOnOff === onoff) return
      this.cacheOnOff = onoff
      const timerKey = Math.random().toString(36).substr(2, 8)
      this.updateTimeout = timerKey
      setTimeout(() => {
        if (this.updateTimeout === timerKey) this.updateTimeout = false
      }, 10000)
      await this.platform.sendDeviceUpdate(this.accessory, {
        switch: this.cacheOnOff
      })
      this.log('[%s] current state [%s].', this.accessory.displayName, this.cacheOnOff)
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
      await this.helpers.sleep(1500)
      if (updateKeyCT !== this.updateKeyCT) return
      this.updateTimeout = updateKeyCT
      setTimeout(() => {
        if (this.updateTimeout === updateKeyCT) this.updateTimeout = false
      }, 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (this.alController && this.alController.isAdaptiveLightingActive()) {
        this.log('[%s] current cct [%sK] via adaptive lighting.', this.accessory.displayName, mToK)
      } else {
        this.log('[%s] current cct [%sK].', this.accessory.displayName, mToK)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.updateTimeout) return
      if (params.switch && params.switch !== this.cacheOnOff) {
        this.cacheOnOff = params.switch
        this.lightService.updateCharacteristic(this.Characteristic.On, this.cacheOnOff === 'on')
        if (params.updateSource) this.log('[%s] current state [%s].', this.accessory.displayName, this.cacheOnOff)
      }
      if (params.white) {
        if (this.helpers.hasProperty(params.white, 'br') && this.cacheBrightness !== params.white.br) {
          this.cacheBrightness = params.white.br
          this.lightService.updateCharacteristic(this.Characteristic.Brightness, this.cacheBrightness)
          if (params.updateSource) this.log('[%s] current brightness [%s%].', this.accessory.displayName, this.cacheBrightness)
        }
        if (this.helpers.hasProperty(params.white, 'ct') && this.cacheCT !== params.white.ct) {
          this.cacheCT = params.white.ct
          const ctToK = Math.round(this.cacheCT / 255 * (this.maxK - this.minK) + this.minK)
          this.cacheMired = Math.min(Math.max(Math.round(1000000 / ctToK), 140), 500)
          this.lightService.updateCharacteristic(this.Characteristic.ColorTemperature, this.cacheMired)
          if (params.updateSource) this.log('[%s] current cct [%sK].', this.accessory.displayName, ctToK)
          if (
            this.alController &&
            this.alController.isAdaptiveLightingActive() &&
            Math.abs(params.white.ct - this.cacheCT) > 20
          ) {
            // *** look for a variation greater than twenty *** \\
            this.alController.disableAdaptiveLighting()
            this.log('[%s] adaptive lighting disabled due to significant colour change.', this.accessory.displayName)
          }
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
