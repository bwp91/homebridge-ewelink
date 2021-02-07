/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceDiffuser {
  constructor (platform, accessory) {
    this.platform = platform
    this.funcs = platform.funcs
    this.messages = platform.messages
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.colourUtils = platform.colourUtils
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.name = accessory.displayName
    this.accessory = accessory

    this.fanService = this.accessory.getService('Diffuser') || this.accessory.addService(this.hapServ.Fan, 'Diffuser', 'diffuser')
    this.lightService = this.accessory.getService('Light') || this.accessory.addService(this.hapServ.Lightbulb, 'Light', 'light')
    this.fanService.getCharacteristic(this.hapChar.On)
      .on('set', this.internalDiffuserOnOffUpdate.bind(this))
    this.fanService.getCharacteristic(this.hapChar.RotationSpeed)
      .on('set', this.internalDiffuserSpeedUpdate.bind(this))
      .setProps({ minStep: 50 })
    this.lightService.getCharacteristic(this.hapChar.On)
      .on('set', this.internalLightOnOffUpdate.bind(this))
    this.lightService.getCharacteristic(this.hapChar.Brightness)
      .on('set', this.internalLightBrightnessUpdate.bind(this))
    this.lightService.getCharacteristic(this.hapChar.Hue)
      .on('set', this.internalLightColourUpdate.bind(this))
    this.lightService.getCharacteristic(this.hapChar.Saturation)
      .on('set', (value, callback) => callback())
  }

  async internalDiffuserOnOffUpdate (value, callback) {
    try {
      callback()
      const onoff = value ? 'on' : 'off'
      if (this.cacheOnOff === onoff) {
        return
      }
      this.cacheOnOff = onoff
      const params = { switch: this.cacheOnOff }
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

  async internalDiffuserSpeedUpdate (value, callback) {
    try {
      callback()
      if (value === 0) {
        return
      }
      const newSpeed = value <= 75 ? 50 : 100
      if (newSpeed === this.cacheSpeed) {
        return
      }
      this.cacheSpeed = newSpeed
      const params = { state: this.cacheSpeed / 50 }
      const updateKeySpeed = Math.random().toString(36).substr(2, 8)
      this.updateKeySpeed = updateKeySpeed
      await this.funcs.sleep(500)
      if (updateKeySpeed !== this.updateKeySpeed) {
        return
      }
      this.updateTimeout = updateKeySpeed
      setTimeout(() => {
        if (this.updateTimeout === updateKeySpeed) {
          this.updateTimeout = false
        }
      }, 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current speed [%s%].', this.name, newSpeed)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalLightOnOffUpdate (value, callback) {
    try {
      callback()
      const onoff = value ? 1 : 0
      if (this.cacheLightOnOff === onoff) {
        return
      }
      this.cacheLightOnOff = onoff
      const params = { lightswitch: this.cacheLightOnOff }
      const updateKeyLight = Math.random().toString(36).substr(2, 8)
      this.updateKeyLight = updateKeyLight
      await this.funcs.sleep(250)
      if (updateKeyLight !== this.updateKeyLight) {
        return
      }
      this.updateTimeout = updateKeyLight
      setTimeout(() => {
        if (this.updateTimeout === updateKeyLight) {
          this.updateTimeout = false
        }
      }, 10000)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (!this.disableDeviceLogging) {
        this.log('[%s] current light [%s%].', this.name, value ? 'on' : 'off')
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalLightBrightnessUpdate (value, callback) {
    try {
      if (this.cacheBrightness === value) {
        callback()
        return
      }
      this.cacheBrightness = value
      callback()
      const updateKeyBright = Math.random().toString(36).substr(2, 8)
      this.updateKeyBright = updateKeyBright
      const params = { lightbright: this.cacheBrightness }
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
        this.log('[%s] current brightness [%s%].', this.name, this.cacheBrightness)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalLightColourUpdate (value, callback) {
    try {
      if (this.cacheOnOff !== 'on' || this.cacheHue === value) {
        callback()
        return
      }
      this.cacheHue = value
      callback()
      const updateKeyColour = Math.random().toString(36).substr(2, 8)
      this.updateKeyColour = updateKeyColour
      const newRGB = this.colourUtils.hs2rgb(
        value,
        this.accessory.getService('Light').getCharacteristic(this.hapChar.Saturation).value
      )
      this.cacheR = newRGB[0]
      this.cacheG = newRGB[0]
      this.cacheB = newRGB[0]
      const params = {
        lightRcolor: this.cacheR,
        lightGcolor: this.cacheG,
        lightBcolor: this.cacheB
      }
      await this.funcs.sleep(1500)
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
        this.log('[%s] current colour [rgb %s %s %s].', this.name, this.cacheR, this.cacheG, this.cacheB)
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
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s%].', this.name, this.cacheOnOff)
        }
        this.fanService.updateCharacteristic(this.hapChar.On, this.cacheOnOff === 'on')
        if (!this.funcs.hasProperty(params, 'state')) {
          this.fanService.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed)
        }
      }
      if (this.funcs.hasProperty(params, 'state') && params.state * 50 !== this.cacheSpeed) {
        this.cacheSpeed = params.state * 50
        this.fanService.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed)
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current speed [%s%].', this.name, this.cacheSpeed)
        }
      }
      if (this.funcs.hasProperty(params, 'lightswitch') && this.cacheLightOnOff !== params.lightswitch) {
        this.cacheLightOnOff = params.lightswitch
        this.lightService.updateCharacteristic(this.hapChar.On, params.lightswitch === 1)
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current light [%s%].', this.nameparams.lightswitch === 1 ? 'on' : 'off')
        }
      }
      if (this.funcs.hasProperty(params, 'lightbright') && this.cacheBrightness !== params.lightbright) {
        this.cacheBrightness = params.lightbright
        this.lightService.updateCharacteristic(this.hapChar.Brightness, params.lightbright)
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current brightness [%s%].', this.nameparams.lightbright)
        }
      }
      if (this.funcs.hasProperty(params, 'lightRcolor')) {
        if (this.cacheR !== params.lightRcolor || this.cacheG !== params.lightGcolor || this.cacheB !== params.lightBcolor) {
          this.cacheR = params.lightRcolor
          this.cacheG = params.lightGcolor
          this.cacheB = params.lightBcolor
          const newColour = this.colourUtils.rgb2hs(this.cacheR, this.cacheG, this.cacheB)
          this.cacheHue = newColour[0]
          this.lightService.updateCharacteristic(this.hapChar.Hue, this.cacheHue)
            .updateCharacteristic(this.hapChar.Saturation, 100)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current colour [rgb %s %s %s].', this.name, this.cacheR, this.cacheG, this.cacheB)
          }
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
