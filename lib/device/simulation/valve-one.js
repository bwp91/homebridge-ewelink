/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceValveOne {
  constructor (platform, accessory) {
    // Set up variables from the platform
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
    const deviceConf = platform.simulations[accessory.context.eweDeviceId]

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

    // If the accessory has a switch service then remove it
    if (this.accessory.getService(this.hapServ.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
    }

    // Add the valve service if it doesn't already exist
    if (!(this.service = this.accessory.getService(this.hapServ.Valve))) {
      this.service = this.accessory.addService(this.hapServ.Valve)
      this.service.setCharacteristic(this.hapChar.Active, 0)
      this.service.setCharacteristic(this.hapChar.InUse, 0)
      this.service.setCharacteristic(this.hapChar.ValveType, 1)
      this.service.setCharacteristic(this.hapChar.SetDuration, 120)
      this.service.addCharacteristic(this.hapChar.RemainingDuration)
    }

    // Add the set handler to the valve active characteristic
    this.service
      .getCharacteristic(this.hapChar.Active)
      .onSet(async value => await this.internalUpdate(value))

    // Add the get handlers only if the user has configured the offlineAsNoResponse setting
    if (platform.config.offlineAsNoResponse) {
      this.service.getCharacteristic(this.hapChar.Active).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.Active).value
      })
    }

    // Add the set handler to the valve set duration characteristic
    this.service.getCharacteristic(this.hapChar.SetDuration).onSet(value => {
      // Check if the valve is currently active
      if (this.service.getCharacteristic(this.hapChar.InUse).value === 1) {
        // Update the remaining duration characteristic with the new value
        this.service.updateCharacteristic(this.hapChar.RemainingDuration, value)

        // Clear any existing active timers
        clearTimeout(this.timer)

        // Set a new active timer with the new time amount
        this.timer = setTimeout(
          () => this.service.setCharacteristic(this.hapChar.Active, 0),
          value * 1000
        )
      }
    })

    // Output the customised options to the log
    const opts = JSON.stringify({
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable',
      type: deviceConf.type
    })
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
  }

  async internalUpdate (value) {
    try {
      if (this.error) {
        throw new Error(this.lang.invalidConfig + ' - ' + this.error)
      }
      const params = {}
      switch (this.setup) {
        case 'oneSwitch':
          params.switch = value ? 'on' : 'off'
          break
        case 'twoSwitch':
          params.switches = [
            {
              switch: value ? 'on' : 'off',
              outlet: 0
            }
          ]
          break
      }
      this.service.updateCharacteristic(this.hapChar.InUse, value)
      switch (value) {
        case 0:
          this.service.updateCharacteristic(this.hapChar.RemainingDuration, 0)
          clearTimeout(this.timer)
          if (this.enableLogging) {
            this.log('[%s] %s [%s].', this.name, this.lang.curState, this.lang.valveNo)
          }
          break
        case 1: {
          const timer = this.service.getCharacteristic(this.hapChar.SetDuration).value
          this.service.updateCharacteristic(this.hapChar.RemainingDuration, timer)
          if (this.enableLogging) {
            this.log('[%s] %s [%s].', this.name, this.lang.curState, this.lang.valveYes)
          }
          this.timer = setTimeout(() => {
            this.service.setCharacteristic(this.hapChar.Active, 0)
          }, timer * 1000)
          break
        }
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.Active, value === 1 ? 0 : 1)
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.error) {
        throw new Error(this.lang.invalidConfig + ' - ' + this.error)
      }
      let isOn = false
      switch (this.setup) {
        case 'oneSwitch':
          if (!params.switch) {
            return
          }
          isOn = params.switch === 'on'
          break
        case 'twoSwitch':
          if (!params.switches) {
            return
          }
          isOn = params.switches[0].switch === 'on'
          break
      }
      if (isOn) {
        if (this.service.getCharacteristic(this.hapChar.Active).value === 0) {
          const timer = this.service.getCharacteristic(this.hapChar.SetDuration).value
          this.service
            .updateCharacteristic(this.hapChar.Active, 1)
            .updateCharacteristic(this.hapChar.InUse, 1)
            .updateCharacteristic(this.hapChar.RemainingDuration, timer)
          if (params.updateSource && this.enableLogging) {
            this.log('[%s] %s [%s].', this.name, this.lang.curState, this.lang.valveYes)
          }
          this.timer = setTimeout(() => {
            this.service.setCharacteristic(this.hapChar.Active, 0)
          }, timer * 1000)
        }
        return
      }
      this.service
        .updateCharacteristic(this.hapChar.Active, 0)
        .updateCharacteristic(this.hapChar.InUse, 0)
        .updateCharacteristic(this.hapChar.RemainingDuration, 0)
      clearTimeout(this.timer)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
