/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceOutlet {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.eveChar = platform.eveChar
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.outletDevices[deviceId]
    this.inUsePowerThreshold = deviceConf && deviceConf.inUsePowerThreshold
      ? deviceConf.inUsePowerThreshold
      : platform.consts.defaultValues.inUsePowerThreshold
    this.pollingInterval = deviceConf && deviceConf.pollingInterval
      ? deviceConf.pollingInterval
      : false
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // TotalConsumption is calculated by the plugin with these context readings
    if (!this.funcs.hasProperty(this.accessory.context, 'energyReadings')) {
      this.accessory.context.energyReadings = []
    }
    if (!this.funcs.hasProperty(this.accessory.context, 'energyReadingTotal')) {
      this.accessory.context.energyReadingTotal = 0
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
      this.service.addCharacteristic(this.eveChar.TotalConsumption)
      this.service.addCharacteristic(this.eveChar.ResetTotal)
    }

    // Add the set handler to the outlet on/off characteristic
    this.service.getCharacteristic(this.hapChar.On).onSet(async value => {
      await this.internalStateUpdate(value)
    })

    // Add the set handler to the outlet eve reset total energy characteristic
    this.service.getCharacteristic(this.eveChar.ResetTotal).onSet(value => {
      this.accessory.context.energyReadings = []
      this.accessory.context.energyReadingTotal = 0
      this.service.updateCharacteristic(this.eveChar.TotalConsumption, 0)
    })

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('energy', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Set up an interval for the plugin to calculate an approx total consumption
    this.intervalPower = setInterval(() => {
      // Every 30 seconds start with a zero reading
      let total = 0

      // Check we have had readings within the previous 30 seconds
      if (this.accessory.context.energyReadings.length > 0) {
        // Accumulate the total from the energy readings
        this.accessory.context.energyReadings.forEach(x => {
          total += x
        })

        // Divide this by the number of entries to get an average W5m
        total /= this.accessory.context.energyReadings.length

        // Convert this to Wh
        total /= 12

        // Convert this to kWh
        total /= 1000

        // Accumulate the grand total that Eve reads as the total consumption
        this.accessory.context.energyReadingTotal += total
      }

      // Reset the array for each 30 second readings
      this.accessory.context.energyReadings = []

      // Update Eve with the new grand total
      this.service.updateCharacteristic(
        this.eveChar.TotalConsumption,
        this.accessory.context.energyReadingTotal
      )
    }, 30000)

    if (
      this.consts.devices.outlet.includes(this.accessory.context.eweUIID) &&
      this.pollingInterval
    ) {
      setTimeout(() => {
        const milli = this.pollingInterval * 1000
        this.internalUIUpdate()
        this.intervalPoll = setInterval(() => this.internalUIUpdate(), milli)
      }, 5000)
    }

    // Stop the intervals on Homebridge shutdown
    platform.api.on('shutdown', () => {
      clearInterval(this.intervalPoll)
      clearInterval(this.intervalPower)
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        inUsePowerThreshold: this.inUsePowerThreshold,
        pollingInterval: this.pollingInterval
      })
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
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s].', this.name, this.messages.curState, this.cacheState)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')
      }, 5000)
      throw new this.platform.api.hap.HapStatusError(-70402)
    }
  }

  async internalUIUpdate () {
    try {
      const params = { uiActive: this.pollingInterval }
      await this.platform.sendDeviceUpdate(this.accessory, params, true)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (params.switch && params.switch !== this.cacheState) {
        this.service.updateCharacteristic(this.hapChar.On, params.switch === 'on')
        this.cacheState = params.switch
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s].', this.name, this.messages.curState, params.switch)
        }
        if (!this.accessory.context.powerReadings) {
          this.service.updateCharacteristic(
            this.hapChar.OutletInUse,
            params.switch === 'on'
          )
        }
      }
      let logger = false
      if (this.funcs.hasProperty(params, 'power')) {
        this.accessory.context.powerReadings = true
        this.service.updateCharacteristic(
          this.hapChar.OutletInUse,
          parseFloat(params.power) > this.inUsePowerThreshold
        )
        this.service.updateCharacteristic(
          this.eveChar.CurrentConsumption,
          parseFloat(params.power)
        )
        const isOn = this.accessory.getService(this.hapServ.Outlet)
          .getCharacteristic(this.hapChar.On).value
        this.accessory.eveService.addEntry({ power: isOn ? parseFloat(params.power) : 0 })
        this.accessory.context.energyReadings.push(parseFloat(params.power))
        logger = true
      }
      if (this.funcs.hasProperty(params, 'voltage')) {
        this.service.updateCharacteristic(
          this.eveChar.Voltage,
          parseFloat(params.voltage)
        )
        logger = true
      }
      if (this.funcs.hasProperty(params, 'current')) {
        this.service.updateCharacteristic(
          this.eveChar.ElectricCurrent,
          parseFloat(params.current)
        )
        logger = true
      }
      if (params.updateSource && logger && !this.disableDeviceLogging) {
        this.log(
          '[%s] %s%s%s.',
          this.name,
          this.funcs.hasProperty(params, 'power')
            ? ' ' + this.messages.curPower + ' [' + params.power + 'W]'
            : '',
          this.funcs.hasProperty(params, 'voltage')
            ? ' ' + this.messages.curVolt + ' [' + params.voltage + 'V]'
            : '',
          this.funcs.hasProperty(params, 'current')
            ? ' ' + this.messages.curCurr + ' [' + params.current + 'A]'
            : ''
        )
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
