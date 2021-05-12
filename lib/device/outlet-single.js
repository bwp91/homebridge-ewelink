/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceOutletSingle {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.eveChar = platform.eveChar
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
    const deviceConf = platform.outletDevices[accessory.context.eweDeviceId]
    this.disableDeviceLogging =
      deviceConf && deviceConf.overrideDisabledLogging
        ? false
        : platform.config.disableDeviceLogging

    // If the accessory has a switch service then remove it
    if (this.accessory.getService(this.hapServ.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
    }

    // Add the outlet service if it doesn't already exist
    this.service =
      this.accessory.getService(this.hapServ.Outlet) ||
      this.accessory.addService(this.hapServ.Outlet)

    // Add the set handler to the outlet on/off characteristic
    this.service.getCharacteristic(this.hapChar.On).onSet(async value => {
      await this.internalStateUpdate(value)
    })

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('energy', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Just a simple outlet model so remove any existing power characteristics
    if (this.service.testCharacteristic(this.eveChar.Voltage)) {
      this.service.removeCharacteristic(this.service.getCharacteristic(this.eveChar.Voltage))
      this.service.removeCharacteristic(
        this.service.getCharacteristic(this.eveChar.CurrentConsumption)
      )
      this.service.removeCharacteristic(
        this.service.getCharacteristic(this.eveChar.ElectricCurrent)
      )
      this.service.removeCharacteristic(
        this.service.getCharacteristic(this.eveChar.TotalConsumption)
      )
      this.service.removeCharacteristic(this.service.getCharacteristic(this.eveChar.ResetTotal))
      this.service.removeCharacteristic(this.service.getCharacteristic(this.hapChar.OutletInUse))
    }

    // Output the customised options to the log if in debug mode
    if (platform.config.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging
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
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (params.switch && params.switch !== this.cacheState) {
        this.service.updateCharacteristic(this.hapChar.On, params.switch === 'on')
        this.cacheState = params.switch
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curState, params.switch)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  currentState () {
    const toReturn = {}
    toReturn.services = ['outlet']
    toReturn.outlet = {
      state: this.service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off'
    }
    return toReturn
  }
}
