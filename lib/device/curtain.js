/* jshint node: true,esversion: 9, -W014, -W033 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceCurtain {
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

    // Initially set the online flag as true (to be then updated as false if necessary)
    this.isOnline = true

    // Set up custom variables for this device type
    const deviceConf = platform.deviceConf[accessory.context.eweDeviceId]

    // Set the correct logging variables for this accessory
    this.enableLogging = !platform.config.disableDeviceLogging
    this.enableDebugLogging = platform.config.debug
    if (deviceConf && deviceConf.overrideLogging) {
      switch (deviceConf.overrideLogging) {
        case 'standard':
          this.enableLogging = true
          this.enableDebugLogging = false
          break
        case 'debug':
          this.enableLogging = true
          this.enableDebugLogging = true
          break
        case 'disable':
          this.enableLogging = false
          this.enableDebugLogging = false
          break
      }
    }

    // Add the window covering service if it doesn't already exist
    this.service =
      this.accessory.getService(this.hapServ.WindowCovering) ||
      this.accessory.addService(this.hapServ.WindowCovering)

    // Add the set handler to the target position characteristic
    this.service
      .getCharacteristic(this.hapChar.TargetPosition)
      .onSet(async value => await this.internalPositionUpdate(value))

    // Add the get handlers only if the user hasn't disabled the disableNoResponse setting
    if (!platform.config.disableNoResponse) {
      this.service.getCharacteristic(this.hapChar.CurrentPosition).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.CurrentPosition).value
      })
      this.service.getCharacteristic(this.hapChar.TargetPosition).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.TargetPosition).value
      })
    }

    // Output the customised options to the log
    const opts = JSON.stringify({
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable'
    })
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
  }

  async internalPositionUpdate (value) {
    try {
      // This acts like a debounce function when endlessly sliding the slider
      const updateKey = Math.random()
        .toString(36)
        .substr(2, 8)
      this.updateKey = updateKey
      await this.funcs.sleep(500)
      if (updateKey !== this.updateKey) {
        return
      }

      // Create the params object to send
      const params = {}

      switch (this.accessory.context.eweUIID) {
        case 11:
          // If we are to fully open/close the curtain we can use the switch param
          if ([0, 100].includes(value)) {
            // 'on' for fully open and 'off' for fully close
            params.switch = value === 100 ? 'on' : 'off'
          } else {
            // Otherwise for a %-point we can use the 'setclose' param
            params.setclose = Math.abs(100 - value)
          }
          break
        case 67:
          // For a %-point we can use the 'per' param int[0=CLOSED, 100=OPEN]
          params.per = value
          break
      }

      // Send the device update
      await this.platform.sendDeviceUpdate(this.accessory, params)

      // Update the cache with the new position
      this.cachePos = value

      // Log the update if appropriate
      if (this.enableLogging) {
        this.log('[%s] %s [%s%].', this.name, this.lang.curPos, this.cachePos)
      }
    } catch (err) {
      // Catch any errors and let the platform display them
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.TargetPosition, this.cachePos)
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      // Don't continue if there are no useful parameters
      if (
        !params.switch &&
        !this.funcs.hasProperty(params, 'setclose') &&
        !this.funcs.hasProperty(params, 'per')
      ) {
        return
      }
      let newPos
      switch (this.accessory.context.eweUIID) {
        case 11:
          // 'setclose' is 0=OPEN 100=CLOSED whereas HomeKit is 0=CLOSED 100=OPEN
          // 'switch' is 'on' for fully open and 'off' for fully close
          if (this.funcs.hasProperty(params, 'setclose')) {
            newPos = Math.abs(100 - params.setclose)
          } else if (params.switch) {
            newPos = params.switch === 'on' ? 100 : 0
          } else {
            return
          }
          break
        case 67:
          // 'per' matches HomeKit status 0=CLOSED 100=OPEN
          if (this.funcs.hasProperty(params, 'per')) {
            newPos = params.per
          } else {
            return
          }
          break
      }

      // Update HomeKit with the provided value
      this.service.updateCharacteristic(this.hapChar.TargetPosition, newPos)
      this.service.updateCharacteristic(this.hapChar.CurrentPosition, newPos)
      this.service.updateCharacteristic(this.hapChar.PositionState, 2)

      // Only update the cache and log if the provided value has changed
      if (params.updateSource && this.cachePos !== newPos) {
        this.cachePos = newPos
        if (this.enableLogging) {
          this.log('[%s] %s [%s%].', this.name, this.lang.curPos, this.cachePos)
        }
      }
    } catch (err) {
      // Catch any errors and let the platform display them
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
