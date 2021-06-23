/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSwitchValve {
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

    // Add the switch service if it doesn't already exist
    this.sService =
      this.accessory.getService(this.hapServ.Switch) ||
      this.accessory.addService(this.hapServ.Switch)

    // Add the valve service if it doesn't already exist
    if (!(this.vService = this.accessory.getService(this.hapServ.Valve))) {
      this.vService = this.accessory.addService(this.hapServ.Valve)
      this.vService.setCharacteristic(this.hapChar.Active, 0)
      this.vService.setCharacteristic(this.hapChar.InUse, 0)
      this.vService.setCharacteristic(this.hapChar.ValveType, 1)
      this.vService.setCharacteristic(this.hapChar.SetDuration, 120)
      this.vService.addCharacteristic(this.hapChar.RemainingDuration)
    }

    // Add the set handler to the switch on/off characteristic
    this.sService
      .getCharacteristic(this.hapChar.On)
      .onSet(async value => await this.internalSwitchUpdate(value))

    // Add the set handler to the valve active characteristic
    this.vService
      .getCharacteristic(this.hapChar.Active)
      .onSet(async value => await this.internalValveUpdate(value))

    // Add the get handlers only if the user has configured the offlineAsNoResponse setting
    if (platform.config.offlineAsNoResponse) {
      this.sService.getCharacteristic(this.hapChar.On).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.sService.getCharacteristic(this.hapChar.On).value
      })
      this.vService.getCharacteristic(this.hapChar.Active).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.vService.getCharacteristic(this.hapChar.Active).value
      })
    }

    // Add the set handler to the valve set duration characteristic
    this.vService.getCharacteristic(this.hapChar.SetDuration).onSet(value => {
      // Check if the valve is currently active
      if (this.vService.getCharacteristic(this.hapChar.InUse).value === 1) {
        // Update the remaining duration characteristic with the new value
        this.vService.updateCharacteristic(this.hapChar.RemainingDuration, value)

        // Clear any existing active timers
        clearTimeout(this.timer)

        // Set a new active timer with the new time amount
        this.timer = setTimeout(
          () => this.vService.setCharacteristic(this.hapChar.Active, 0),
          value * 1000
        )
      }
    })

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('switch', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log
    const opts = JSON.stringify({
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable',
      type: deviceConf.type
    })
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
  }

  async internalSwitchUpdate (value) {
    try {
      const params = {
        switches: [
          {
            switch: value ? 'on' : 'off',
            outlet: 0
          }
        ]
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheState = value ? 'on' : 'off'
      this.accessory.eveService.addEntry({ status: value ? 1 : 0 })
      if (this.enableLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.sService.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async internalValveUpdate (value) {
    try {
      const params = {
        switches: [
          {
            switch: value ? 'on' : 'off',
            outlet: 1
          }
        ]
      }
      this.vService.updateCharacteristic(this.hapChar.InUse, value)
      switch (value) {
        case 0:
          this.vService.updateCharacteristic(this.hapChar.RemainingDuration, 0)
          clearTimeout(this.timer)
          if (this.enableLogging) {
            this.log('[%s] %s [%s].', this.name, this.lang.curState, this.lang.valveNo)
          }
          break
        case 1: {
          const timer = this.vService.getCharacteristic(this.hapChar.SetDuration).value
          this.vService.updateCharacteristic(this.hapChar.RemainingDuration, timer)
          if (this.enableLogging) {
            this.log('[%s] %s [%s].', this.name, this.lang.curState, this.lang.valveYes)
          }
          this.timer = setTimeout(() => {
            this.vService.setCharacteristic(this.hapChar.Active, 0)
          }, timer * 1000)
          break
        }
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.sService.updateCharacteristic(this.hapChar.Active, 0)
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switches) {
        return
      }
      if (this.cacheState !== (params.switches[0].switch === 'on')) {
        const newStatus = params.switches[0].switch === 'on'
        this.cacheState = params.switches[0].switch
        this.sService.updateCharacteristic(this.hapChar.On, newStatus)
        this.accessory.eveService.addEntry({ status: newStatus ? 1 : 0 })
        if (params.updateSource && this.enableLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
        }
      }
      if (params.switches[1].switch === 'on') {
        if (this.vService.getCharacteristic(this.hapChar.Active).value === 0) {
          const timer = this.vService.getCharacteristic(this.hapChar.SetDuration).value
          this.vService.updateCharacteristic(this.hapChar.Active, 1)
          this.vService.updateCharacteristic(this.hapChar.InUse, 1)
          this.vService.updateCharacteristic(this.hapChar.RemainingDuration, timer)
          if (params.updateSource && this.enableLogging) {
            this.log('[%s] %s [%s].', this.name, this.lang.curState, this.lang.valveYes)
          }
          this.timer = setTimeout(() => {
            this.vService.setCharacteristic(this.hapChar.Active, 0)
          }, timer * 1000)
        }
        return
      }
      this.vService.updateCharacteristic(this.hapChar.Active, 0)
      this.vService.updateCharacteristic(this.hapChar.InUse, 0)
      this.vService.updateCharacteristic(this.hapChar.RemainingDuration, 0)
      clearTimeout(this.timer)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
