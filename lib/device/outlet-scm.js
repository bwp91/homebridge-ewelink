/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceOutletSCM {
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

    // Set up custom variables for this device type
    const deviceConf = platform.outletDevices[accessory.context.eweDeviceId]
    this.showAsSwitch = deviceConf && deviceConf.showAsSwitch
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Check if the user has overridden how this accessory should appear
    if (this.showAsSwitch) {
      // User has chosen switch so if the accessory has an outlet service then remove it
      if (this.accessory.getService(this.hapServ.Outlet)) {
        this.accessory.removeService(this.accessory.getService(this.hapServ.Outlet))
      }

      // Add the switch service if it doesn't already exist
      this.service = this.accessory.getService(this.hapServ.Switch) ||
        this.accessory.addService(this.hapServ.Switch)
    } else {
      // The default is an outlet so if the accessory has an switch service then remove it
      if (this.accessory.getService(this.hapServ.Switch)) {
        this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
      }

      // Add the outlet service if it doesn't already exist
      this.service = this.accessory.getService(this.hapServ.Outlet) ||
        this.accessory.addService(this.hapServ.Outlet)
    }

    // Add the set handler to the switch/outlet on/off characteristic
    this.service.getCharacteristic(this.hapChar.On).onSet(async value => {
      await this.internalStateUpdate(value)
    })

    // Output the customised options to the log if in debug mode
    if (platform.config.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        showAsSwitch: this.showAsSwitch
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async internalStateUpdate (value) {
    try {
      const newValue = value ? 'on' : 'off'
      if (newValue === this.cacheState) {
        return
      }
      const params = {
        switches: [{ switch: newValue, outlet: 0 }]
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
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

  async externalUpdate (params) {
    try {
      if (!params.switches || params.switches[0].switch === this.cacheState) {
        return
      }
      const newStatus = params.switches[0].switch === 'on'
      this.service.updateCharacteristic(this.hapChar.On, newStatus)
      this.cacheState = params.switches[0].switch
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  currentState () {
    const toReturn = {}
    const service = this.showAsSwitch ? 'switch' : 'outlet'
    toReturn.services = [service]
    toReturn[service] = {
      state: this.service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off'
    }
    return toReturn
  }
}
