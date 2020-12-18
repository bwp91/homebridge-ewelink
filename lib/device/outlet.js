/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const util = require('util')
module.exports = class deviceOutlet {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.inUsePowerThreshold = parseInt(this.platform.config.inUsePowerThreshold)
    this.inUsePowerThreshold = isNaN(this.inUsePowerThreshold)
      ? this.helpers.defaults.inUsePowerThreshold
      : this.inUsePowerThreshold < 0
        ? this.helpers.defaults.inUsePowerThreshold
        : this.inUsePowerThreshold
    const self = this
    this.eveCurrentConsumption = function () {
      self.Characteristic.call(this, 'Current Consumption', this.helpers.eveUUID.currentConsumption)
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
      self.Characteristic.call(this, 'Total Consumption', this.helpers.eveUUID.totalConsumption)
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
      self.Characteristic.call(this, 'Voltage', this.helpers.eveUUID.voltage)
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
      self.Characteristic.call(this, 'Electric Current', this.helpers.eveUUID.electricCurrent)
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
      self.Characteristic.call(this, 'Reset Total', this.helpers.eveUUID.resetTotal)
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
    this.eveCurrentConsumption.UUID = this.helpers.eveUUID.currentConsumption
    this.eveTotalConsumption.UUID = this.helpers.eveUUID.totalConsumption
    this.eveVoltage.UUID = this.helpers.eveUUID.voltage
    this.eveElectricCurrent.UUID = this.helpers.eveUUID.electricCurrent
    this.eveResetTotal.UUID = this.helpers.eveUUID.resetTotal
    if (!this.helpers.hasProperty(accessory.context, 'energyReadings')) accessory.context.energyReadings = []
    if (!this.helpers.hasProperty(accessory.context, 'energyReadingTotal')) accessory.context.energyReadingTotal = 0
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
      .on('set', this.internalUpdate.bind(this))
    this.outletService
      .getCharacteristic(this.eveResetTotal)
      .on('set', (value, callback) => {
        callback()
        accessory.context.energyReadings = []
        accessory.context.energyReadingTotal = 0
        this.outletService.updateCharacteristic(this.eveTotalConsumption, 0)
      })
    accessory.log = this.log
    accessory.eveLogger = new this.platform.eveService('energy', accessory, {
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
      if (this.helpers.hasProperty(params, 'switch')) {
        this.outletService.updateCharacteristic(this.Characteristic.On, params.switch === 'on')
        if (!this.accessory.context.powerReadings) {
          this.outletService.updateCharacteristic(this.Characteristic.OutletInUse, params.switch === 'on')
        }
      }
      if (this.helpers.hasProperty(params, 'power')) {
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
      if (this.helpers.hasProperty(params, 'voltage')) {
        this.outletService.updateCharacteristic(this.eveVoltage, parseFloat(params.voltage))
      }
      if (this.helpers.hasProperty(params, 'current')) {
        this.outletService.updateCharacteristic(this.eveElectricCurrent, parseFloat(params.current))
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
