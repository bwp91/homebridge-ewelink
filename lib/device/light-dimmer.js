/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceLightDimmer {
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
    this.lightService.getCharacteristic(this.Characteristic.Brightness)
      .on('set', this.internalBrightnessUpdate.bind(this))
    this.accessory = accessory
  }

  async internalOnOffUpdate (value, callback) {
    try {
      callback()
      const onoff = value ? 'on' : 'off'
      if (onoff === this.cacheOnOff) return
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
      callback()
      const params = {}
      const updateKey = Math.random().toString(36).substr(2, 8)
      this.updateKeyBright = updateKey
      switch (this.accessory.context.eweUIID) {
        case 36:
        // *** KING-M4 eWeLink scale is 10-100 and HomeKit scale is 0-100. *** \\
          params.bright = Math.round((value * 9) / 10 + 10)
          break
        case 44:
        // *** D1 eWeLink scale matches HomeKit scale of 0-100 *** \\
          params.brightness = value
          params.mode = 0
          break
      }
      await this.helpers.sleep(500)
      if (updateKey !== this.updateKeyBright) return
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheBrightness = value
      this.log('[%s] current brightness [%s%].', this.accessory.displayName, value)
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
      switch (this.accessory.context.eweUIID) {
        case 36:
          // *** KING-M4 eWeLink scale is 10-100 and HomeKit scale is 0-100. *** \\
          if (this.helpers.hasProperty(params, 'bright')) {
            const nb = Math.round(((params.bright - 10) * 10) / 9)
            if (nb !== this.cacheBrightness) {
              this.lightService.updateCharacteristic(this.Characteristic.Brightness, nb)
              this.cacheBrightness = nb
              if (params.updateSource) this.log('[%s] current brightness [%s%].', this.accessory.displayName, nb)
            }
          }
          break
        case 44:
          // *** D1 eWeLink scale matches HomeKit scale of 0-100 *** \\
          if (this.helpers.hasProperty(params, 'brightness')) {
            if (params.brightness !== this.cacheBrightness) {
              this.lightService.updateCharacteristic(this.Characteristic.Brightness, params.brightness)
              this.cacheBrightness = params.brightness
              if (params.updateSource) this.log('[%s] current brightness [%s%].', this.accessory.displayName, params.brightness)
            }
          }
          break
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
