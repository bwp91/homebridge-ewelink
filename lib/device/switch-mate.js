/* jshint node: true, esversion: 10, -W014, -W033 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSwitchMate {
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

    // Add the switch for channel 1
    this.service1 =
      this.accessory.getService('Channel 1') ||
      this.accessory.addService(this.hapServ.Switch, 'Channel 1', 'channel1')

    // Add the switch for channel 2
    this.service2 =
      this.accessory.getService('Channel 2') ||
      this.accessory.addService(this.hapServ.Switch, 'Channel 2', 'channel2')

    // Add the switch for channel 3
    this.service3 =
      this.accessory.getService('Channel 3') ||
      this.accessory.addService(this.hapServ.Switch, 'Channel 3', 'channel3')

    // Add the set handlers
    this.service1
      .getCharacteristic(this.hapChar.On)
      .onSet(async value => await this.internalStateUpdate(value, 1, this.service1))
    this.service2
      .getCharacteristic(this.hapChar.On)
      .onSet(async value => await this.internalStateUpdate(value, 2, this.service2))
    this.service3
      .getCharacteristic(this.hapChar.On)
      .onSet(async value => await this.internalStateUpdate(value, 3, this.service3))

    // Add the get handlers only if the user hasn't disabled the disableNoResponse setting
    if (!platform.config.disableNoResponse) {
      this.service1.getCharacteristic(this.hapChar.On).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service1.getCharacteristic(this.hapChar.On).value
      })
      this.service2.getCharacteristic(this.hapChar.On).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service2.getCharacteristic(this.hapChar.On).value
      })
      this.service3.getCharacteristic(this.hapChar.On).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service3.getCharacteristic(this.hapChar.On).value
      })
    }

    // Output the customised options to the log
    const opts = JSON.stringify({
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable'
    })
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
  }

  async internalStateUpdate (value, channel, service) {
    try {
      if (value) {
        return
      }
      const params = {
        outlet: channel,
        key: 0
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (this.enableLogging) {
        this.log('[%s] [%s] %s [on].', this.name, service.displayName, this.lang.curState)
      }
      setTimeout(() => {
        service.updateCharacteristic(this.hapChar.On, false)
        if (this.enableLogging) {
          this.log('[%s] [%s] %s [off].', this.name, service.displayName, this.lang.curState)
        }
      }, 2000)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        service.updateCharacteristic(this.hapChar.On, false)
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      this.log.warn('New Command Received:')
      this.log(JSON.stringify(params))
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
