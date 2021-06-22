/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceOutletPower {
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
    this.inUsePowerThreshold =
      deviceConf && deviceConf.inUsePowerThreshold
        ? deviceConf.inUsePowerThreshold
        : platform.consts.defaultValues.inUsePowerThreshold

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

    // Add the outlet service if it doesn't already exist
    if (!(this.service = this.accessory.getService(this.hapServ.Outlet))) {
      this.service = this.accessory.addService(this.hapServ.Outlet)
      this.service.addCharacteristic(this.eveChar.Voltage)
      this.service.addCharacteristic(this.eveChar.CurrentConsumption)
      this.service.addCharacteristic(this.eveChar.ElectricCurrent)
    }

    // Add the set handler to the outlet on/off characteristic
    this.service.getCharacteristic(this.hapChar.On).onSet(async value => {
      await this.internalStateUpdate(value)
    })

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('energy', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Set up an interval to get eWeLink to send power updates
    setTimeout(() => {
      this.internalUIUpdate()
      this.intervalPoll = setInterval(() => this.internalUIUpdate(), 120000)
    }, 5000)

    // Stop the intervals on Homebridge shutdown
    platform.api.on('shutdown', () => {
      clearInterval(this.intervalPoll)
    })
    
    // Remove unneeded characteristics
    if (this.service.testCharacteristic(this.eveChar.TotalConsumption)) {
      this.service.removeCharacteristic(
        this.service.getCharacteristic(this.eveChar.TotalConsumption)
      )
    }
    if (this.service.testCharacteristic(this.eveChar.ResetTotal)) {
      this.service.removeCharacteristic(
        this.service.getCharacteristic(this.eveChar.ResetTotal)
      )
    }

    // Output the customised options to the log
    const opts = JSON.stringify({
      inUsePowerThreshold: this.inUsePowerThreshold,
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
      await this.platform.sendDeviceUpdate(this.accessory, {
        switch: newValue
      })
      this.cacheState = newValue
      if (!value) {
        this.service.updateCharacteristic(this.hapChar.OutletInUse, false)
        this.service.updateCharacteristic(this.eveChar.CurrentConsumption, 0)
        this.accessory.eveService.addEntry({ power: 0 })
      }
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

  async internalUIUpdate () {
    try {
      const params = { uiActive: 120 }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      // Suppress errors here
    }
  }

  async externalUpdate (params) {
    try {
      if (params.switch && params.switch !== this.cacheState) {
        this.service.updateCharacteristic(this.hapChar.On, params.switch === 'on')
        this.cacheState = params.switch
        if (this.cacheState === 'off') {
          this.service.updateCharacteristic(this.hapChar.OutletInUse, false)
          this.service.updateCharacteristic(this.eveChar.CurrentConsumption, 0)
          this.accessory.eveService.addEntry({ power: 0 })
        }
        if (params.updateSource && this.enableLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curState, params.switch)
        }
      }
      let logger = false
      if (this.funcs.hasProperty(params, 'power')) {
        const power = parseFloat(params.power)
        this.service.updateCharacteristic(
          this.hapChar.OutletInUse,
          this.cacheState === 'on' && power > this.inUsePowerThreshold
        )
        this.service.updateCharacteristic(this.eveChar.CurrentConsumption, power)
        this.accessory.eveService.addEntry({
          power: this.cacheState === 'on' ? power : 0
        })
        logger = true
      }
      if (this.funcs.hasProperty(params, 'voltage')) {
        this.service.updateCharacteristic(this.eveChar.Voltage, parseFloat(params.voltage))
        logger = true
      }
      if (this.funcs.hasProperty(params, 'current')) {
        this.service.updateCharacteristic(this.eveChar.ElectricCurrent, parseFloat(params.current))
        logger = true
      }
      if (params.updateSource && logger && this.enableLogging) {
        this.log(
          '[%s] %s%s%s.',
          this.name,
          this.funcs.hasProperty(params, 'power')
            ? this.lang.curPower + ' [' + params.power + 'W]'
            : '',
          this.funcs.hasProperty(params, 'voltage')
            ? ' ' + this.lang.curVolt + ' [' + params.voltage + 'V]'
            : '',
          this.funcs.hasProperty(params, 'current')
            ? ' ' + this.lang.curCurr + ' [' + params.current + 'A]'
            : ''
        )
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
