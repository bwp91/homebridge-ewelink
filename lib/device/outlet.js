/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceOutlet {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.disableDeviceLogging = platform.config.disableDeviceLogging
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
    this.inUsePowerThreshold = this.platform.config.inUsePowerThreshold

    // Set up the custom Eve characteristics for this device type
    this.inherits = require('util').inherits
    const self = this
    this.eveCurrentConsumption = function () {
      self.hapChar.call(this, 'Current Consumption', self.consts.eve.currentConsumption)
      this.setProps({
        format: self.hapChar.Formats.UINT16,
        unit: 'W',
        maxValue: 100000,
        minValue: 0,
        minStep: 1,
        perms: [self.hapChar.Perms.READ, self.hapChar.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.eveTotalConsumption = function () {
      self.hapChar.call(this, 'Total Consumption', self.consts.eve.totalConsumption)
      this.setProps({
        format: self.hapChar.Formats.FLOAT,
        unit: 'kWh',
        maxValue: 100000000000,
        minValue: 0,
        minStep: 0.01,
        perms: [self.hapChar.Perms.READ, self.hapChar.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.eveVoltage = function () {
      self.hapChar.call(this, 'Voltage', self.consts.eve.voltage)
      this.setProps({
        format: self.hapChar.Formats.FLOAT,
        unit: 'V',
        maxValue: 100000000000,
        minValue: 0,
        minStep: 1,
        perms: [self.hapChar.Perms.READ, self.hapChar.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.eveElectricCurrent = function () {
      self.hapChar.call(this, 'Electric Current', self.consts.eve.electricCurrent)
      this.setProps({
        format: self.hapChar.Formats.FLOAT,
        unit: 'A',
        maxValue: 100000000000,
        minValue: 0,
        minStep: 0.1,
        perms: [self.hapChar.Perms.READ, self.hapChar.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.eveResetTotal = function () {
      self.hapChar.call(this, 'Reset Total', self.consts.eve.resetTotal)
      this.setProps({
        format: self.hapChar.Formats.UINT32,
        perms: [
          self.hapChar.Perms.READ,
          self.hapChar.Perms.NOTIFY,
          self.hapChar.Perms.WRITE
        ]
      })
      this.value = this.getDefaultValue()
    }
    this.inherits(this.eveCurrentConsumption, this.hapChar)
    this.inherits(this.eveTotalConsumption, this.hapChar)
    this.inherits(this.eveVoltage, this.hapChar)
    this.inherits(this.eveElectricCurrent, this.hapChar)
    this.inherits(this.eveResetTotal, this.hapChar)
    this.eveCurrentConsumption.UUID = this.consts.eve.currentConsumption
    this.eveTotalConsumption.UUID = this.consts.eve.totalConsumption
    this.eveVoltage.UUID = this.consts.eve.voltage
    this.eveElectricCurrent.UUID = this.consts.eve.electricCurrent
    this.eveResetTotal.UUID = this.consts.eve.resetTotal

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
      this.service.addCharacteristic(this.eveVoltage)
      this.service.addCharacteristic(this.eveCurrentConsumption)
      this.service.addCharacteristic(this.eveElectricCurrent)
      this.service.addCharacteristic(this.eveTotalConsumption)
      this.service.addCharacteristic(this.eveResetTotal)
    }

    // Add the set handler to the outlet on/off characteristic
    this.service.getCharacteristic(this.hapChar.On)
      .on('set', this.internalUpdate.bind(this))

    // Add the set handler to the outlet eve reset total energy characteristic
    this.service.getCharacteristic(this.eveResetTotal)
      .on('set', (value, callback) => {
        callback()
        this.accessory.context.energyReadings = []
        this.accessory.context.energyReadingTotal = 0
        this.service.updateCharacteristic(this.eveTotalConsumption, 0)
      })

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
    this.accessory.eveService = new this.platform.eveService('energy', this.accessory, {
      storage: 'fs',
      path: platform.eveLogPath
    })

    // Set up an interval for the plugin to calculate an approx total consumption
    setInterval(() => {
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
        this.eveTotalConsumption,
        this.accessory.context.energyReadingTotal
      )
    }, 300000)
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      await this.platform.sendDeviceUpdate(this.accessory, { switch: value ? 'on' : 'off' })
      this.cacheOnOff = value ? 'on' : 'off'
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, value ? 'on' : 'off')
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (params.switch && params.switch !== this.cacheOnOff) {
        this.service.updateCharacteristic(this.hapChar.On, params.switch === 'on')
        this.cacheOnOff = params.switch
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.name, params.switch)
        }
        if (!this.accessory.context.powerReadings) {
          this.service.updateCharacteristic(this.hapChar.OutletInUse, params.switch === 'on')
        }
      }
      let logger = false
      if (this.funcs.hasProperty(params, 'power')) {
        this.accessory.context.powerReadings = true
        this.service.updateCharacteristic(this.hapChar.OutletInUse, parseFloat(params.power) > this.inUsePowerThreshold)
          .updateCharacteristic(this.eveCurrentConsumption, parseFloat(params.power))
        const isOn = this.accessory.getService(this.hapServ.Outlet).getCharacteristic(this.hapChar.On).value
        this.accessory.eveService.addEntry({
          time: Math.round(new Date().valueOf() / 1000),
          power: isOn ? parseFloat(params.power) : 0
        })
        this.accessory.context.energyReadings.push(parseFloat(params.power))
        logger = true
      }
      if (this.funcs.hasProperty(params, 'voltage')) {
        this.service.updateCharacteristic(this.eveVoltage, parseFloat(params.voltage))
        logger = true
      }
      if (this.funcs.hasProperty(params, 'current')) {
        this.service.updateCharacteristic(this.eveElectricCurrent, parseFloat(params.current))
        logger = true
      }
      if (params.updateSource && logger && !this.disableDeviceLogging) {
        this.log(
          '[%s] current%s%s%s.',
          this.name,
          this.funcs.hasProperty(params, 'power') ? ' power [' + params.power + 'W]' : '',
          this.funcs.hasProperty(params, 'voltage') ? ' voltage [' + params.voltage + 'V]' : '',
          this.funcs.hasProperty(params, 'current') ? ' current [' + params.current + 'A]' : ''
        )
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
