/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceDiffuser {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.colourUtils = platform.colourUtils
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
    const deviceConf = platform.singleDevices[deviceId]
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Add the fan service if it doesn't already exist
    this.fanService = this.accessory.getService('Diffuser') ||
      this.accessory.addService(this.hapServ.Fan, 'Diffuser', 'diffuser')

    // Add the lightbulb service if it doesn't already exist
    this.lightService = this.accessory.getService('Light') ||
      this.accessory.addService(this.hapServ.Lightbulb, 'Light', 'light')

    // Add the set handler to the fan on/off characteristic
    this.fanService.getCharacteristic(this.hapChar.On)
      .on('set', this.internalDiffuserOnOffUpdate.bind(this))

    // Add the set handler to the fan rotation characteristic
    this.fanService.getCharacteristic(this.hapChar.RotationSpeed)
      .on('set', this.internalDiffuserSpeedUpdate.bind(this))
      .setProps({ minStep: 50 })

    // Add the set handler to the lightbulb on/off characteristic
    this.lightService.getCharacteristic(this.hapChar.On)
      .on('set', this.internalLightOnOffUpdate.bind(this))

    // Add the set handler to the lightbulb brightness characteristic
    this.lightService.getCharacteristic(this.hapChar.Brightness)
      .on('set', this.internalLightBrightnessUpdate.bind(this))

    // Add the set handler to the lightbulb hue characteristic
    this.lightService.getCharacteristic(this.hapChar.Hue)
      .on('set', this.internalLightColourUpdate.bind(this))

    // Add the set handler to the lightbulb saturation characteristic
    this.lightService.getCharacteristic(this.hapChar.Saturation)
      .on('set', (value, callback) => callback())

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({ disableDeviceLogging: this.disableDeviceLogging })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async internalDiffuserOnOffUpdate (value, callback) {
    try {
      // Call callback() first to avoid any 'No Response' errors in HomeKit
      callback()

      // Don't continue if the requested new state is the same as the current state
      const onoff = value ? 'on' : 'off'
      if (this.cacheOnOff === onoff) {
        return
      }

      // Update the cache with the new state
      this.cacheOnOff = onoff

      // Create the params object to send
      const params = { switch: this.cacheOnOff }

      // Set up a ten second timeout for the plugin to ignore incoming updates
      const timerKey = Math.random().toString(36).substr(2, 8)
      this.updateTimeout = timerKey
      setTimeout(() => {
        if (this.updateTimeout === timerKey) {
          this.updateTimeout = false
        }
      }, 10000)

      // Send the device update
      await this.platform.sendDeviceUpdate(this.accessory, params)

      // Log the update if appropriate
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
      }
    } catch (err) {
      // Catch any errors and let the platform display them
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalDiffuserSpeedUpdate (value, callback) {
    try {
      // Call callback() first to avoid any 'No Response' errors in HomeKit
      callback()

      // Don't continue if turning off as this will be handled by on/off handler
      if (value === 0) {
        return
      }

      // The new speed can be {50, 100} so use rounding on the new value
      const newSpeed = value <= 75 ? 50 : 100

      // Check the rounded speed against the current cache value
      if (newSpeed === this.cacheSpeed) {
        return
      }

      // Update the cache value with the new speed
      this.cacheSpeed = newSpeed

      // Create the params object, mapping the state to {50, 100} -> {1, 2}
      const params = { state: this.cacheSpeed / 50 }

      // This acts like a debounce function when endlessly sliding the brightness scale
      const updateKeySpeed = Math.random().toString(36).substr(2, 8)
      this.updateKeySpeed = updateKeySpeed
      await this.funcs.sleep(450)
      if (updateKeySpeed !== this.updateKeySpeed) {
        return
      }

      // Update the brightness with the new value as some apps don't support minStep
      this.fanService.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed)

      // Set up a ten second timeout for the plugin to ignore incoming updates
      this.updateTimeout = updateKeySpeed
      setTimeout(() => {
        if (this.updateTimeout === updateKeySpeed) {
          this.updateTimeout = false
        }
      }, 10000)

      // Send the device update
      await this.platform.sendDeviceUpdate(this.accessory, params)

      // Log the update if appropriate
      if (!this.disableDeviceLogging) {
        this.log('[%s] current speed [%s%].', this.name, newSpeed)
      }
    } catch (err) {
      // Catch any errors and let the platform display them
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
      const saturation = this.accessory.getService('Light')
        .getCharacteristic(this.hapChar.Saturation).value
      const newRGB = this.colourUtils.hs2rgb(value, saturation)
      this.cacheR = newRGB[0]
      this.cacheG = newRGB[0]
      this.cacheB = newRGB[0]
      const params = {
        lightRcolor: this.cacheR,
        lightGcolor: this.cacheG,
        lightBcolor: this.cacheB
      }
      await this.funcs.sleep(400)
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
        this.log(
          '[%s] current colour [rgb %s %s %s].',
          this.name,
          this.cacheR,
          this.cacheG,
          this.cacheB
        )
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
      if (
        this.funcs.hasProperty(params, 'state') &&
        params.state * 50 !== this.cacheSpeed
      ) {
        this.cacheSpeed = params.state * 50
        this.fanService.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed)
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current speed [%s%].', this.name, this.cacheSpeed)
        }
      }
      if (
        this.funcs.hasProperty(params, 'lightswitch') &&
        this.cacheLightOnOff !== params.lightswitch
      ) {
        this.cacheLightOnOff = params.lightswitch
        this.lightService.updateCharacteristic(this.hapChar.On, params.lightswitch === 1)
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log(
            '[%s] current light [%s%].',
            this.name,
            params.lightswitch === 1 ? 'on' : 'off'
          )
        }
      }
      if (
        this.funcs.hasProperty(params, 'lightbright') &&
        this.cacheBrightness !== params.lightbright
      ) {
        this.cacheBrightness = params.lightbright
        this.lightService
          .updateCharacteristic(this.hapChar.Brightness, params.lightbright)
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current brightness [%s%].', this.name, params.lightbright)
        }
      }
      if (this.funcs.hasProperty(params, 'lightRcolor')) {
        if (
          this.cacheR !== params.lightRcolor ||
          this.cacheG !== params.lightGcolor ||
          this.cacheB !== params.lightBcolor
        ) {
          this.cacheR = params.lightRcolor
          this.cacheG = params.lightGcolor
          this.cacheB = params.lightBcolor
          const newColour = this.colourUtils.rgb2hs(this.cacheR, this.cacheG, this.cacheB)
          this.cacheHue = newColour[0]
          this.lightService.updateCharacteristic(this.hapChar.Hue, this.cacheHue)
            .updateCharacteristic(this.hapChar.Saturation, 100)
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log(
              '[%s] current colour [rgb %s %s %s].',
              this.name,
              this.cacheR,
              this.cacheG,
              this.cacheB
            )
          }
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
