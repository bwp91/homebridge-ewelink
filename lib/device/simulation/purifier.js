/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class devicePurifier {
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

    // If the accessory has an outlet service then remove it
    if (this.accessory.getService(this.hapServ.Outlet)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Outlet))
    }

    // Add the air purifier service if it doesn't already exist
    this.service =
      this.accessory.getService(this.hapServ.AirPurifier) ||
      this.accessory.addService(this.hapServ.AirPurifier)

    // Add the set handler to the purifier active characteristic
    this.service
      .getCharacteristic(this.hapChar.Active)
      .onSet(async value => await this.internalStateUpdate(value))

    // Add options to the purifier target state characteristic
    this.service
      .getCharacteristic(this.hapChar.TargetAirPurifierState)
      .setProps({
        minValue: 1,
        maxValue: 1,
        validValues: [1]
      })
      .updateValue(1)

    // Add the get handlers only if the user has configured the offlineAsNoResponse setting
    if (platform.config.offlineAsNoResponse) {
      this.service.getCharacteristic(this.hapChar.Active).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.Active).value
      })
      this.service.getCharacteristic(this.hapChar.CurrentAirPurifierState).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.CurrentAirPurifierState).value
      })
      this.service.getCharacteristic(this.hapChar.TargetAirPurifierState).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.TargetAirPurifierState).value
      })
    }

    // Output the customised options to the log
    const opts = JSON.stringify({
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable'
    })
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
  }

  async internalStateUpdate (value) {
    try {
      const params = {}
      switch (this.setup) {
        case 'oneSwitch':
          params.switch = value === 1 ? 'on' : 'off'
          break
        case 'twoSwitch':
          params.switches = [
            {
              switch: value === 1 ? 'on' : 'off',
              outlet: 0
            }
          ]
          break
        default:
          return
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheState = value === 1 ? 'on' : 'off'
      this.service.updateCharacteristic(this.hapChar.CurrentAirPurifierState, value === 1 ? 2 : 0)
      if (this.enableLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curPur, this.cacheState)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0)
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (params.switches) {
        if (!this.setup) {
          this.setup = 'twoSwitch'
        }
        if (params.switches[0].switch === this.cacheState) {
          return
        }
        this.cacheState = params.switches[0].switch
      } else if (params.switch) {
        if (!this.setup) {
          this.setup = 'oneSwitch'
        }
        if (params.switch === this.cacheState) {
          return
        }
        this.cacheState = params.switch
      } else {
        return
      }
      this.service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0)
      this.service.updateCharacteristic(
        this.hapChar.CurrentAirPurifierState,
        this.cacheState === 'on' ? 2 : 0
      )
      if (params.updateSource && this.enableLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curPur, this.cacheState)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
