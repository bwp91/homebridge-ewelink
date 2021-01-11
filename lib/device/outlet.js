/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const util = require('util')
module.exports = class deviceOutlet {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
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
      self.Characteristic.call(this, 'Current Consumption', self.helpers.eveUUID.currentConsumption)
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
      self.Characteristic.call(this, 'Total Consumption', self.helpers.eveUUID.totalConsumption)
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
      self.Characteristic.call(this, 'Voltage', self.helpers.eveUUID.voltage)
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
      self.Characteristic.call(this, 'Electric Current', self.helpers.eveUUID.electricCurrent)
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
      self.Characteristic.call(this, 'Reset Total', self.helpers.eveUUID.resetTotal)
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
    if (!(this.service = accessory.getService(this.Service.Outlet))) {
      this.service = accessory.addService(this.Service.Outlet)
      this.service.addCharacteristic(this.eveVoltage)
      this.service.addCharacteristic(this.eveCurrentConsumption)
      this.service.addCharacteristic(this.eveElectricCurrent)
      this.service.addCharacteristic(this.eveTotalConsumption)
      this.service.addCharacteristic(this.eveResetTotal)
    }
    this.service
      .getCharacteristic(this.Characteristic.On)
      .on('set', this.internalUpdate.bind(this))
    this.service
      .getCharacteristic(this.eveResetTotal)
      .on('set', (value, callback) => {
        callback()
        accessory.context.energyReadings = []
        accessory.context.energyReadingTotal = 0
        this.service.updateCharacteristic(this.eveTotalConsumption, 0)
      })
    accessory.log = this.log
    accessory.eveService = new this.platform.eveService('energy', accessory)
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
      this.service.updateCharacteristic(this.eveTotalConsumption, accessory.context.energyReadingTotal)
    }, 300000)
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      await this.platform.sendDeviceUpdate(this.accessory, { switch: value ? 'on' : 'off' })
      this.cacheOnOff = value ? 'on' : 'off'
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.accessory.displayName, value ? 'on' : 'off')
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (params.switch && params.switch !== this.cacheOnOff) {
        this.service.updateCharacteristic(this.Characteristic.On, params.switch === 'on')
        this.cacheOnOff = params.switch
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.accessory.displayName, params.switch)
        }
        if (!this.accessory.context.powerReadings) {
          this.service.updateCharacteristic(this.Characteristic.OutletInUse, params.switch === 'on')
        }
      }
      let logger = false
      if (this.helpers.hasProperty(params, 'power')) {
        this.accessory.context.powerReadings = true
        this.service
          .updateCharacteristic(this.Characteristic.OutletInUse, parseFloat(params.power) > this.inUsePowerThreshold)
          .updateCharacteristic(this.eveCurrentConsumption, parseFloat(params.power))
        const isOn = this.accessory.getService(this.Service.Outlet).getCharacteristic(this.Characteristic.On).value
        this.accessory.eveService.addEntry({ power: isOn ? parseFloat(params.power) : 0 })
        this.accessory.context.energyReadings.push(parseFloat(params.power))
        logger = true
      }
      if (this.helpers.hasProperty(params, 'voltage')) {
        this.service.updateCharacteristic(this.eveVoltage, parseFloat(params.voltage))
        logger = true
      }
      if (this.helpers.hasProperty(params, 'current')) {
        this.service.updateCharacteristic(this.eveElectricCurrent, parseFloat(params.current))
        logger = true
      }
      if (params.updateSource && logger && !this.disableDeviceLogging) {
        this.log(
          '[%s] current%s%s%s.',
          this.accessory.displayName,
          this.helpers.hasProperty(params, 'power') ? ' power [' + params.power + 'W]' : '',
          this.helpers.hasProperty(params, 'voltage') ? ' voltage [' + params.power + 'V]' : '',
          this.helpers.hasProperty(params, 'current') ? ' current [' + params.power + 'A]' : ''
        )
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
