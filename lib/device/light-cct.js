/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceLightCCT {
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
    this.service.getCharacteristic(this.hapChar.On).onSet(async value => {
      await this.internalStateUpdate(value)
    })

    // Add the set handler to the lightbulb brightness characteristic
    this.service.getCharacteristic(this.hapChar.Brightness)
      .setProps({ minStep: this.brightStep })
      .onSet(async value => {
        await this.internalBrightnessUpdate(value)
      })

    // Add the set handler to the lightbulb colour temperature characteristic
    this.service.getCharacteristic(this.hapChar.ColorTemperature).onSet(async value => {
      await this.internalCTUpdate(value)
    })

    // This is needed as sometimes we need to send the brightness with a cct update
    this.cacheBright = this.service.getCharacteristic(this.hapChar.Brightness).value

    // Set up the adaptive lighting controller
    this.accessory.alController = new platform.api.hap.AdaptiveLightingController(
      this.service,
      { customTemperatureAdjustment: this.alShift }
    )
    this.accessory.configureController(this.accessory.alController)

    // Output the customised options to the log if in debug mode
    if (platform.config.debug) {
      const opts = JSON.stringify({
        adaptiveLightingShift: this.alShift,
        brightnessStep: this.brightStep,
        disableDeviceLogging: this.disableDeviceLogging,
        bulbModel: this.bulbModel
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async internalStateUpdate (value) {
    try {
      const newValue = value ? 'on' : 'off'
      if (this.cacheState === newValue) {
        return
      }
      const timerKey = Math.random().toString(36).substr(2, 8)
      this.updateTimeout = timerKey
      setTimeout(() => {
        if (this.updateTimeout === timerKey) {
          this.updateTimeout = false
        }
      }, 5000)
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
      }, 5000)
      throw new this.hapErr(-70402)
    }
  }

  async internalBrightnessUpdate (value) {
    try {
      if (this.cacheBright === value) {
        return
      }
      const updateKey = Math.random().toString(36).substr(2, 8)
      this.updateKeyBright = updateKey
      await this.funcs.sleep(500)
      if (updateKey !== this.updateKeyBright) {
        return
      }
      this.updateTimeout = updateKey
      setTimeout(() => {
        if (this.updateTimeout === updateKey) {
          this.updateTimeout = false
        }
      }, 5000)
      const params = {
        white: {
          br: value,
          ct: this.cacheCT
        }
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheBright = value
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s%].', this.name, this.lang.curBright, this.cacheBright)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')
      }, 5000)
      throw new this.hapErr(-70402)
    }
  }

  async internalCTUpdate (value) {
    try {
      if (this.cacheMired === value || this.cacheState !== 'on') {
        return
      }
      if (!this.isOnline && this.accessory.alController.isAdaptiveLightingActive()) {
        return
      }
      const updateKey = Math.random().toString(36).substr(2, 8)
      this.updateKeyCT = updateKey
      await this.funcs.sleep(400)
      if (updateKey !== this.updateKeyCT) {
        return
      }
      this.updateTimeout = updateKey
      setTimeout(() => {
        if (this.updateTimeout === updateKey) {
          this.updateTimeout = false
        }
      }, 5000)
      const kelvin = Math.round(1000000 / value)
      const scaledK = Math.max(Math.min(kelvin, this.maxK), this.minK)
      const scaledCT = Math.round(((scaledK - this.minK) / (this.maxK - this.minK)) * 255)
      const params = {
        white: {
          br: this.cacheBright,
          ct: scaledCT
        }
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheMired = value
      this.cacheCT = scaledCT
      if (!this.disableDeviceLogging) {
        if (
          this.accessory.alController &&
          this.accessory.alController.isAdaptiveLightingActive()
        ) {
          this.log(
            '[%s] %s [%sK] %s.',
            this.name,
            this.lang.curColour,
            scaledK,
            this.lang.viaAL
          )
        } else {
          this.log('[%s] %s [%sK].', this.name, this.lang.curColour, scaledK)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')
      }, 5000)
      throw new this.hapErr(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.updateTimeout) {
        return
      }
      if (params.switch && params.switch !== this.cacheState) {
        this.cacheState = params.switch
        this.service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
        }
      }
      if (params.white) {
        if (
          this.funcs.hasProperty(params.white, 'br') &&
          this.cacheBright !== params.white.br
        ) {
          this.cacheBright = params.white.br
          this.service.updateCharacteristic(this.hapChar.Brightness, this.cacheBright)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] %s [%s%].', this.name, this.lang.curBright, this.cacheBright)
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
          this.service.updateCharacteristic(
            this.hapChar.ColorTemperature,
            this.cacheMired
          )
          if (params.updateSource) {
            if (!this.disableDeviceLogging) {
              this.log('[%s] %s [%sK].', this.name, this.lang.curColour, scaledK)
            }
            if (this.accessory.alController.isAdaptiveLightingActive() && ctDiff > 20) {
              // Look for a variation greater than twenty
              this.accessory.alController.disableAdaptiveLighting()
              if (!this.disableDeviceLogging) {
                this.log('[%s] %s.', this.name, this.lang.disabledAL)
              }
            }
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

  currentState () {
    const toReturn = {}
    toReturn.services = ['light']
    toReturn.light = {
      state: this.service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off',
      brightness: this.service.getCharacteristic(this.hapChar.Brightness).value,
      colourtemperature: this.service.getCharacteristic(this.hapChar.ColorTemperature).value,
      adaptivelighting: this.accessory.alController.isAdaptiveLightingActive() ? 'on' : 'off'
    }
    return toReturn
  }
}
