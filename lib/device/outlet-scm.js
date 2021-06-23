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

    // Initially set the online flag as true (to be then updated as false if necessary)
    this.isOnline = true

    // Set up custom variables for this device type
    const deviceConf = platform.outletDevices[accessory.context.eweDeviceId]

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

    // The default is an outlet so if the accessory has an switch service then remove it
    if (this.accessory.getService(this.hapServ.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
    }

    // Add the outlet service if it doesn't already exist
    this.service =
      this.accessory.getService(this.hapServ.Outlet) ||
      this.accessory.addService(this.hapServ.Outlet)

    this.service
      .getCharacteristic(this.hapChar.On)
      .onGet(() => {
        if (!this.isOnline && platform.config.offlineAsNoResponse) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.On).value
      })
      .onSet(async value => await this.internalStateUpdate(value))

    // Output the customised options to the log
    const opts = JSON.stringify({
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable'
    })
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
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
      if (this.enableLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')
      }, 2000)
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
      if (params.updateSource && this.enableLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
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
    const service = 'outlet'
    toReturn.services = [service]
    toReturn[service] = {
      state: this.service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off'
    }
    return toReturn
  }
}
