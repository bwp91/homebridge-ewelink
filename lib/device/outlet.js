/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const fakegato = require('./../fakegato/fakegato-history')
const helpers = require('./../helpers')
const util = require('util')
module.exports = class deviceOutlet {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.EveHistoryService = fakegato(platform.api)
    this.inUsePowerThreshold = parseInt(this.platform.config.inUsePowerThreshold)
    this.inUsePowerThreshold = isNaN(this.inUsePowerThreshold)
      ? helpers.defaults.inUsePowerThreshold
      : this.inUsePowerThreshold < 0
        ? helpers.defaults.inUsePowerThreshold
        : this.inUsePowerThreshold
    const self = this
    this.eveCurrentConsumption = function () {
      self.Characteristic.call(this, 'Current Consumption', 'E863F10D-079E-48FF-8F27-9C2605A29F52')
      this.setProps({
        format: self.Characteristic.Formats.UINT16,
        unit: 'W',
        maxValue: 100000,
        minValue: 0,
        minStep: 1,
        perms: [self.Characteristic.Perms.READ, self.Characteristic.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.eveTotalConsumption = function () {
      self.Characteristic.call(this, 'Total Consumption', 'E863F10C-079E-48FF-8F27-9C2605A29F52')
      this.setProps({
        format: self.Characteristic.Formats.FLOAT,
        unit: 'kWh',
        maxValue: 100000000000,
        minValue: 0,
        minStep: 0.01,
        perms: [self.Characteristic.Perms.READ, self.Characteristic.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.eveVoltage = function () {
      self.Characteristic.call(this, 'Voltage', 'E863F10A-079E-48FF-8F27-9C2605A29F52')
      this.setProps({
        format: self.Characteristic.Formats.FLOAT,
        unit: 'V',
        maxValue: 100000000000,
        minValue: 0,
        minStep: 1,
        perms: [self.Characteristic.Perms.READ, self.Characteristic.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.eveElectricCurrent = function () {
      self.Characteristic.call(this, 'Electric Current', 'E863F126-079E-48FF-8F27-9C2605A29F52')
      this.setProps({
        format: self.Characteristic.Formats.FLOAT,
        unit: 'A',
        maxValue: 100000000000,
        minValue: 0,
        minStep: 0.1,
        perms: [self.Characteristic.Perms.READ, self.Characteristic.Perms.NOTIFY]
      })
      this.value = this.getDefaultValue()
    }
    this.eveResetTotal = function () {
      self.Characteristic.call(this, 'Reset Total', 'E863F112-079E-48FF-8F27-9C2605A29F52')
      this.setProps({
        format: self.Characteristic.Formats.UINT32,
        perms: [self.Characteristic.Perms.READ, self.Characteristic.Perms.NOTIFY, self.Characteristic.Perms.WRITE]
      })
      this.value = this.getDefaultValue()
    }
    util.inherits(this.eveCurrentConsumption, this.Characteristic)
    util.inherits(this.eveTotalConsumption, this.Characteristic)
    util.inherits(this.eveVoltage, this.Characteristic)
    util.inherits(this.eveElectricCurrent, this.Characteristic)
    util.inherits(this.eveResetTotal, this.Characteristic)
    this.eveCurrentConsumption.UUID = 'E863F10D-079E-48FF-8F27-9C2605A29F52'
    this.eveTotalConsumption.UUID = 'E863F10C-079E-48FF-8F27-9C2605A29F52'
    this.eveVoltage.UUID = 'E863F10A-079E-48FF-8F27-9C2605A29F52'
    this.eveElectricCurrent.UUID = 'E863F126-079E-48FF-8F27-9C2605A29F52'
    this.eveResetTotal.UUID = 'E863F112-079E-48FF-8F27-9C2605A29F52'
    if (!helpers.hasProperty(accessory.context, 'energyReadings')) accessory.context.energyReadings = []
    if (!helpers.hasProperty(accessory.context, 'energyReadingTotal')) accessory.context.energyReadingTotal = 0
    if (accessory.getService(this.Service.Switch)) {
      accessory.removeService(accessory.getService(this.Service.Switch))
    }
    if (!(this.outletService = accessory.getService(this.Service.Outlet))) {
      this.outletService = accessory.addService(this.Service.Outlet)
      this.outletService.addCharacteristic(this.eveVoltage)
      this.outletService.addCharacteristic(this.eveCurrentConsumption)
      this.outletService.addCharacteristic(this.eveElectricCurrent)
      this.outletService.addCharacteristic(this.eveTotalConsumption)
      this.outletService.addCharacteristic(this.eveResetTotal)
    }
    this.outletService
      .getCharacteristic(this.Characteristic.On)
      .on('set', (value, callback) => this.internalUpdate(value, callback))
    this.outletService
      .getCharacteristic(this.eveResetTotal)
      .on('set', (value, callback) => {
        callback()
        accessory.context.energyReadings = []
        accessory.context.energyReadingTotal = 0
        this.outletService.updateCharacteristic(this.eveTotalConsumption, 0)
      })
    accessory.log = this.platform.log
    accessory.eveLogger = new this.EveHistoryService('energy', accessory, {
      storage: 'fs',
      path: this.platform.eveLogPath
    })
    setInterval(() => {
      let total = 0
      if (accessory.context.energyReadings.length > 0) {
        accessory.context.energyReadings.forEach(x => (total += x))
        total /= accessory.context.energyReadings.length // W5m
        total /= 12 // Wh
        total /= 1000 // kWh
        accessory.context.energyReadingTotal += total
      }
      accessory.context.energyReadings = []
      this.outletService.updateCharacteristic(this.eveTotalConsumption, accessory.context.energyReadingTotal)
    }, 300000)
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      const params = { switch: value ? 'on' : 'off' }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (helpers.hasProperty(params, 'switch')) {
        this.outletService.updateCharacteristic(this.Characteristic.On, params.switch === 'on')
        if (!this.accessory.context.powerReadings) {
          this.outletService.updateCharacteristic(this.Characteristic.OutletInUse, params.switch === 'on')
        }
      }
      if (helpers.hasProperty(params, 'power')) {
        this.accessory.context.powerReadings = true
        this.outletService
          .updateCharacteristic(this.Characteristic.OutletInUse, parseFloat(params.power) > this.inUsePowerThreshold)
          .updateCharacteristic(this.eveCurrentConsumption, parseFloat(params.power))
        const isOn = this.accessory.getService(this.Service.Outlet).getCharacteristic(this.Characteristic.On).value
        this.accessory.eveLogger.addEntry({
          time: Math.round(new Date().valueOf() / 1000),
          power: isOn ? parseFloat(params.power) : 0
        })
        this.accessory.context.energyReadings.push(parseFloat(params.power))
      }
      if (helpers.hasProperty(params, 'voltage')) {
        this.outletService.updateCharacteristic(this.eveVoltage, parseFloat(params.voltage))
      }
      if (helpers.hasProperty(params, 'current')) {
        this.outletService.updateCharacteristic(this.eveElectricCurrent, parseFloat(params.current))
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
