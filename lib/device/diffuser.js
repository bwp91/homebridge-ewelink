/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceDiffuser {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.colourUtils = platform.colourUtils
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
    const deviceConf = platform.singleDevices[accessory.context.eweDeviceId]
    this.disableDeviceLogging =
      deviceConf && deviceConf.overrideDisabledLogging
        ? false
        : platform.config.disableDeviceLogging

    // Add the fan service if it doesn't already exist
    this.fanService =
      this.accessory.getService('Diffuser') ||
      this.accessory.addService(this.hapServ.Fan, 'Diffuser', 'diffuser')

    // Add the lightbulb service if it doesn't already exist
    this.lightService =
      this.accessory.getService('Light') ||
      this.accessory.addService(this.hapServ.Lightbulb, 'Light', 'light')

    // Add the set handler to the fan on/off characteristic
    this.fanService.getCharacteristic(this.hapChar.On).onSet(async value => {
      await this.internalDiffuserOnOffUpdate(value)
    })

    // Add the set handler to the fan rotation characteristic
    this.fanService
      .getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({ minStep: 50 })
      .onSet(async value => {
        await this.internalDiffuserSpeedUpdate(value)
      })

    // Add the set handler to the lightbulb on/off characteristic
    this.lightService.getCharacteristic(this.hapChar.On).onSet(async value => {
      await this.internalLightStateUpdate(value)
    })

    // Add the set handler to the lightbulb brightness characteristic
    this.lightService.getCharacteristic(this.hapChar.Brightness).onSet(async value => {
      await this.internalLightBrightnessUpdate(value)
    })

    // Add the set handler to the lightbulb hue characteristic
    this.lightService.getCharacteristic(this.hapChar.Hue).onSet(async value => {
      await this.internalLightColourUpdate(value)
    })

    // Output the customised options to the log if in debug mode
    if (platform.config.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async internalDiffuserOnOffUpdate (value) {
    try {
      // Don't continue if the requested new state is the same as the current state
      const newValue = value ? 'on' : 'off'
      if (this.cacheState === newValue) {
        return
      }

      // Create the params object to send
      const params = { switch: newValue }

      // Set up a five second timeout for the plugin to ignore incoming updates
      const timerKey = Math.random()
        .toString(36)
        .substr(2, 8)
      this.updateTimeout = timerKey
      setTimeout(() => {
        if (this.updateTimeout === timerKey) {
          this.updateTimeout = false
        }
      }, 5000)

      // Send the device update
      await this.platform.sendDeviceUpdate(this.accessory, params)

      // Update the cache with the new state
      this.cacheState = newValue

      // Log the update if appropriate
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
      }
    } catch (err) {
      // Catch any errors and let the platform display them
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.fanService.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async internalDiffuserSpeedUpdate (value) {
    try {
      // Don't continue if turning off as this will be handled by on/off handler
      if (value === 0) {
        return
      }

      // The new speed can be {50, 100} so use rounding on the new value
      const newValue = value <= 50 ? 50 : 100

      // Check the rounded speed against the current cache value
      if (newValue === this.cacheSpeed) {
        return
      }

      // Create the params object, mapping the state to {50, 100} -> {1, 2}
      const params = { state: newValue / 50 }

      // This acts like a debounce function when endlessly sliding the brightness scale
      const updateKeySpeed = Math.random()
        .toString(36)
        .substr(2, 8)
      this.updateKeySpeed = updateKeySpeed
      await this.funcs.sleep(450)
      if (updateKeySpeed !== this.updateKeySpeed) {
        return
      }

      // Set up a five second timeout for the plugin to ignore incoming updates
      this.updateTimeout = updateKeySpeed
      setTimeout(() => {
        if (this.updateTimeout === updateKeySpeed) {
          this.updateTimeout = false
        }
      }, 5000)

      // Send the device update
      await this.platform.sendDeviceUpdate(this.accessory, params)

      // Update the cache value with the new speed
      this.cacheSpeed = newValue

      // Log the update if appropriate
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s%].', this.name, this.lang.curSpeed, this.cacheSpeed)
      }
    } catch (err) {
      // Catch any errors and let the platform display them
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.fanService.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed)
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async internalLightStateUpdate (value) {
    try {
      // Don't continue if the new value is the same as before
      const newValue = value ? 1 : 0
      if (this.cacheLight === newValue) {
        return
      }

      // Create the params object
      const params = { lightswitch: this.cacheLight }

      // Set up a five second timeout for the plugin to ignore incoming updates
      const updateKeyLight = Math.random()
        .toString(36)
        .substr(2, 8)
      this.updateTimeout = updateKeyLight
      setTimeout(() => {
        if (this.updateTimeout === updateKeyLight) {
          this.updateTimeout = false
        }
      }, 5000)

      // Send the device update
      await this.platform.sendDeviceUpdate(this.accessory, params)

      // Update the cache value
      this.cacheLight = newValue

      // Log the update if appropriate
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s%].', this.name, this.lang.curLight, value === 1 ? 'on' : 'off')
      }
    } catch (err) {
      // Catch any errors and let the platform display them
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.lightService.updateCharacteristic(this.hapChar.On, this.cacheLight === 'on')
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async internalLightBrightnessUpdate (value) {
    try {
      // Don't continue if the new value is the same as before
      if (this.cacheBright === value) {
        return
      }

      // Create the params object
      const params = { lightbright: value }

      // This acts like a debounce function when endlessly sliding the brightness scale
      const updateKeyBright = Math.random()
        .toString(36)
        .substr(2, 8)
      this.updateKeyBright = updateKeyBright
      await this.funcs.sleep(500)
      if (updateKeyBright !== this.updateKeyBright) {
        return
      }

      // Set up a five second timeout for the plugin to ignore incoming updates
      this.updateTimeout = updateKeyBright
      setTimeout(() => {
        if (this.updateTimeout === updateKeyBright) {
          this.updateTimeout = false
        }
      }, 5000)

      // Send the device update
      await this.platform.sendDeviceUpdate(this.accessory, params)

      // Update the cache value
      this.cacheBright = value

      // Log the update if appropriate
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s%].', this.name, this.lang.curBright, this.cacheBright)
      }
    } catch (err) {
      // Catch any errors and let the platform display them
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.lightService.updateCharacteristic(this.hapChar.Brightness, this.cacheBright)
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async internalLightColourUpdate (value) {
    try {
      // Don't continue if the light is off or the new value is the same as before
      if (this.cacheState !== 'on' || this.cacheHue === value) {
        return
      }

      // Create the params object
      const sat = this.lightService.getCharacteristic(this.hapChar.Saturation).value
      const newRGB = this.colourUtils.hs2rgb(value, sat)
      const params = {
        lightRcolor: newRGB[0],
        lightGcolor: newRGB[1],
        lightBcolor: newRGB[2]
      }

      // This acts like a debounce function when endlessly sliding the colour wheel
      const updateKeyColour = Math.random()
        .toString(36)
        .substr(2, 8)
      this.updateKeyColour = updateKeyColour
      await this.funcs.sleep(400)
      if (updateKeyColour !== this.updateKeyColour) {
        return
      }

      // Set up a five second timeout for the plugin to ignore incoming updates
      this.updateTimeout = updateKeyColour
      setTimeout(() => {
        if (this.updateTimeout === updateKeyColour) {
          this.updateTimeout = false
        }
      }, 5000)

      // Send the device update
      await this.platform.sendDeviceUpdate(this.accessory, params)

      // Update the cache values
      this.cacheHue = value
      this.cacheR = newRGB[0]
      this.cacheG = newRGB[0]
      this.cacheB = newRGB[0]

      // Log the update if appropriate
      if (!this.disableDeviceLogging) {
        this.log(
          '[%s] %s [rgb %s].',
          this.name,
          this.lang.curColour,
          this.cacheR + ' ' + this.cacheG + ' ' + this.cacheB
        )
      }
    } catch (err) {
      // Catch any errors and let the platform display them
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.lightService.updateCharacteristic(this.hapChar.Hue, this.cacheHue)
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      // We can often receive old info when updating new values so ignore during timeout
      if (this.updateTimeout) {
        return
      }

      // Check to see if we are provided new and different on/off information
      if (params.switch && params.switch !== this.cacheState) {
        // Update the cache value
        this.cacheState = params.switch

        // Update the HomeKit value
        this.fanService.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')

        // If the diffuser is on but no speed provided, then update speed with the cache
        if (this.cacheState === 'on' && !this.funcs.hasProperty(params, 'state')) {
          this.fanService.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed)
        }

        // Log if appropriate
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s%].', this.name, this.lang.curState, this.cacheState)
        }
      }

      // Check to see if we are provided new and different speed information
      if (this.funcs.hasProperty(params, 'state') && params.state * 50 !== this.cacheSpeed) {
        // State is {0, 1, 2} corresponding to {0, 50, 100} rotation speed
        this.cacheSpeed = params.state * 50

        // Update the HomeKit value
        this.fanService.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed)

        // Log if appropriate
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s%].', this.name, this.lang.curSpeed, this.cacheSpeed)
        }
      }

      // Check to see if we are provided new and different light on/off information
      if (this.funcs.hasProperty(params, 'lightswitch') && this.cacheLight !== params.lightswitch) {
        // Lightswitch is {0, 1} corresponding to {false, true} off/on state
        this.cacheLight = params.lightswitch

        // Update the HomeKit value
        this.lightService.updateCharacteristic(this.hapChar.On, params.lightswitch === 1)

        // Log if appropriate
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log(
            '[%s] %s [%s%].',
            this.name,
            this.lang.curLight,
            params.lightswitch === 1 ? 'on' : 'off'
          )
        }
      }

      // Check to see if we are provided new and different light brightness information
      if (
        this.funcs.hasProperty(params, 'lightbright') &&
        this.cacheBright !== params.lightbright
      ) {
        // Lightbright is [0, 100] corresponding to [0, 100] brightness
        this.cacheBright = params.lightbright

        // Update the HomeKit value
        this.lightService.updateCharacteristic(this.hapChar.Brightness, params.lightbright)

        // Log if appropriate
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s%].', this.name, this.lang.curBright, this.cacheBright)
        }
      }

      // Check to see if we are provided new and different light colour information
      if (
        this.funcs.hasProperty(params, 'lightRcolor') &&
        (this.cacheR !== params.lightRcolor ||
          this.cacheG !== params.lightGcolor ||
          this.cacheB !== params.lightBcolor)
      ) {
        // Lightcolor is provided as [0, 255] corresponding to RGB values
        this.cacheR = params.lightRcolor
        this.cacheG = params.lightGcolor
        this.cacheB = params.lightBcolor

        // Get the Hue information from the RGB colour (saturation is always 100)
        const newColour = this.colourUtils.rgb2hs(this.cacheR, this.cacheG, this.cacheB)
        this.cacheHue = newColour[0]

        // Update the HomeKit values
        this.lightService.updateCharacteristic(this.hapChar.Hue, this.cacheHue)
        this.lightService.updateCharacteristic(this.hapChar.Saturation, 100)

        // Log if appropriate
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log(
            '[%s] %s [rgb %s].',
            this.name,
            this.lang.curColour,
            this.cacheR + ' ' + this.cacheG + ' ' + this.cacheB
          )
        }
      }
    } catch (err) {
      // Catch any errors and let the platform display them
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
