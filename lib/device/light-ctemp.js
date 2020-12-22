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
    if (platform.api.versionGreaterOrEqual && platform.api.versionGreaterOrEqual('1.3.0-beta.27')) {
      this.alController = new platform.api.hap.AdaptiveLightingController(this.lightService)
      accessory.configureController(this.alController)
    }
    this.accessory = accessory
  }

  async internalOnOffUpdate (value, callback) {
    try {
      callback()
      const onoff = value ? 'on' : 'off'
      if (onoff === this.cacheOnOff) return
      this.ignoreForAMoment = true
      setTimeout(() => (this.ignoreForAMoment = false), 10000)
      await this.platform.sendDeviceUpdate(this.accessory, {
        switch: onoff
      })
      this.cacheOnOff = onoff
      this.log('[%s] current state [%s].', this.accessory.displayName, onoff)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalBrightnessUpdate (value, callback) {
    try {
      await this.helpers.sleep(750)
      callback()
      if (this.lastSentBrightness === value) return
      this.lastSentBrightness = value
      const updateKeyBright = Math.random().toString(36).substr(2, 8)
      this.updateKeyBright = updateKeyBright
      // *** Device needs the current ct value sent too *** \\
      const params = {
        switch: this.cacheOnOff,
        ltype: 'white',
        white: {
          br: value,
          ct: this.cacheCT
        }
      }
      await this.helpers.sleep(500)
      if (updateKeyBright !== this.updateKeyBright) return
      this.ignoreForAMoment = true
      setTimeout(() => (this.ignoreForAMoment = false), 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheBrightness = value
      this.log('[%s] current brightness [%s%].', this.accessory.displayName, value)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalCTempUpdate (value, callback) {
    try {
      await this.helpers.sleep(1500)
      callback()
      const mToK = Math.max(Math.min(Math.round(1000000 / value), this.maxK), this.minK)
      const kToCT = Math.round(((mToK - this.minK) / (this.maxK - this.minK)) * 255)
      if (this.cacheCT === kToCT) return
      const updateKeyCT = Math.random().toString(36).substr(2, 8)
      this.updateKeyCT = updateKeyCT
      // HomeKit has a ct range of 140-500 corresponding to 2000-7143K
      const params = {
        switch: this.cacheOnOff,
        ltype: 'white',
        white: {
          br: this.lightService.getCharacteristic(this.Characteristic.Brightness).value,
          ct: kToCT
        }
      }
      await this.helpers.sleep(500)
      if (updateKeyCT !== this.updateKeyCT) return
      this.ignoreForAMoment = true
      setTimeout(() => (this.ignoreForAMoment = false), 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheCT = kToCT
      this.log('[%s] current cct [%sK].', this.accessory.displayName, mToK)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (params.switch && params.switch !== this.cacheOnOff) {
        this.lightService.updateCharacteristic(this.Characteristic.On, params.switch === 'on')
        this.cacheOnOff = params.switch
        if (params.updateSource) this.log('[%s] current state [%s].', this.accessory.displayName, params.switch)
      }
      if (params.white) {
        if (this.helpers.hasProperty(params.white, 'br') && this.cacheBrightness !== params.white.br) {
          this.lightService.updateCharacteristic(this.Characteristic.Brightness, params.white.br)
          this.cacheBrightness = params.white.br
          if (params.updateSource) this.log('[%s] current brightness [%s%].', this.accessory.displayName, params.white.br)
        }
        if (this.helpers.hasProperty(params.white, 'ct') && this.cacheCT !== params.white.ct && this.ignoreForAMoment) {
          const ctToK = Math.round(params.white.ct / 255 * (this.maxK - this.minK) + this.minK)
          const kToMired = Math.min(Math.max(Math.round(1000000 / ctToK), 140), 500)
          this.lightService.updateCharacteristic(this.Characteristic.ColorTemperature, kToMired)
          if (params.updateSource && this.alController && Math.abs(this.cacheCT - params.white.ct) > 5) {
            this.alController.disableAdaptiveLighting()
            this.log(
              '[%s] adaptive lighting disabled due to variance in ct [prev:%s now:%s].',
              this.accessory.displayName,
              this.cacheCT,
              params.white.ct
            )
          }
          this.cacheCT = params.white.ct
          if (params.updateSource) this.log('[%s] current cct [%sK].', this.accessory.displayName, ctToK)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
