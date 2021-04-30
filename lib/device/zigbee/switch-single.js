/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceZBSwitchSingle {
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

    // Set up custom variables for this device type
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.singleDevices[deviceId]
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Add the switch service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.Switch) ||
      this.accessory.addService(this.hapServ.Switch)

    // Add the get/set handler to the switch on/off characteristic
    this.service.getCharacteristic(this.hapChar.On)
      .onGet(() => {
        if (this.isOnline) {
          return this.service.getCharacteristic(this.hapChar.On).value
        } else {
          throw new this.platform.api.hap.HapStatusError(-70402)
        }
      })
      .onSet(async value => {
        await this.internalStateUpdate(value)
      })

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('switch', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({ disableDeviceLogging: this.disableDeviceLogging })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async internalStateUpdate (value) {
    try {
      const newValue = value ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, {
        switch: newValue
      })
      this.cacheState = newValue
      this.accessory.eveService.addEntry({ status: value ? 1 : 0 })
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s].', this.name, this.messages.curState, newValue)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')
      }, 5000)
      throw new this.platform.api.hap.HapStatusError(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switch || params.switch === this.cacheState) {
        return
      }
      this.cacheState = params.switch
      this.service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')
      this.accessory.eveService.addEntry({ status: this.cacheState === 'on' ? 1 : 0 })
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] %s [%s].', this.name, this.messages.curState, this.cacheState)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
