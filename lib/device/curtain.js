/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceCurtain {
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

    /*
      This device's parameters are:
      switch: str{'on'=OPEN, 'off'=CLOSED}
      setclose: int[0=OPEN, 100=CLOSED]
    */

    // Set up custom variables for this device type
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.singleDevices[deviceId]
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Add the window covering service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.WindowCovering) ||
      this.accessory.addService(this.hapServ.WindowCovering)

    // Add the set handler to the target position characteristic
    this.service.getCharacteristic(this.hapChar.TargetPosition).onSet(async value => {
      await this.internalPositionUpdate(value)
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({ disableDeviceLogging: this.disableDeviceLogging })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async internalPositionUpdate (value) {
    try {
      // This acts like a debounce function when endlessly sliding the slider
      const updateKey = Math.random().toString(36).substr(2, 8)
      this.updateKey = updateKey
      await this.funcs.sleep(500)
      if (updateKey !== this.updateKey) {
        return
      }

      // Create the params object to send
      const params = {}

      // If we are to fully open/close the curtain we can use the switch param
      if ([0, 100].includes(value)) {
        // 'on' for fully open and 'off' for fully close
        params.switch = value === 100 ? 'on' : 'off'
      } else {
        // Otherwise for a %-point we can use the setclose param
        params.setclose = Math.abs(100 - value)
      }

      // Send the device update
      await this.platform.sendDeviceUpdate(this.accessory, params)

      // Update the cache with the new position
      this.cachePos = value

      // Log the update if appropriate
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s%].', this.name, this.messages.curPos, this.cachePos)
      }
    } catch (err) {
      // Catch any errors and let the platform display them
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(
          this.hapChar.TargetPosition,
          this.cachePos
        )
      }, 5000)
      throw new this.platform.api.hap.HapStatusError(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      // Don't continue if there are no useful parameters
      if (!params.switch && !this.funcs.hasProperty(params, 'setclose')) {
        return
      }

      // setclose is 0=OPEN 100=CLOSED whereas HomeKit is 0=CLOSED 100=OPEN
      const newPos = Math.abs(100 - parseInt(params.setclose))

      // Update HomeKit with the provided value
      this.service.updateCharacteristic(this.hapChar.TargetPosition, newPos)
      this.service.updateCharacteristic(this.hapChar.CurrentPosition, newPos)
      this.service.updateCharacteristic(this.hapChar.PositionState, 2)

      // Only update the cache and log if the provided value has changed
      if (params.updateSource && this.cachePos !== newPos) {
        this.cachePos = newPos
        if (!this.disableDeviceLogging) {
          this.log('[%s] %s [%s%].', this.name, this.messages.curPos, this.cachePos)
        }
      }
    } catch (err) {
      // Catch any errors and let the platform display them
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
