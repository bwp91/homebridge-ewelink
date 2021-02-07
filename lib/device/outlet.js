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

    this.inUsePowerThreshold = parseInt(this.platform.config.inUsePowerThreshold)
    this.inUsePowerThreshold = isNaN(this.inUsePowerThreshold) || this.inUsePowerThreshold < 0
      ? this.consts.defaults.inUsePowerThreshold
      : this.inUsePowerThreshold
    this.inherits = require('util').inherits
    const self = this
    this.eveCurrentConsumption = function () {
      self.hapChar.call(this, 'Current Consumption', self.consts.eveUUID.currentConsumption)
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
      self.hapChar.call(this, 'Total Consumption', self.consts.eveUUID.totalConsumption)
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
      self.hapChar.call(this, 'Voltage', self.consts.eveUUID.voltage)
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
      self.hapChar.call(this, 'Electric Current', self.consts.eveUUID.electricCurrent)
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
      self.hapChar.call(this, 'Reset Total', self.consts.eveUUID.resetTotal)
      this.setProps({
        format: self.hapChar.Formats.UINT32,
        perms: [self.hapChar.Perms.READ, self.hapChar.Perms.NOTIFY, self.hapChar.Perms.WRITE]
      })
      this.value = this.getDefaultValue()
    }
    this.inherits(this.eveCurrentConsumption, this.hapChar)
    this.inherits(this.eveTotalConsumption, this.hapChar)
    this.inherits(this.eveVoltage, this.hapChar)
    this.inherits(this.eveElectricCurrent, this.hapChar)
    this.inherits(this.eveResetTotal, this.hapChar)
    this.eveCurrentConsumption.UUID = this.consts.eveUUID.currentConsumption
    this.eveTotalConsumption.UUID = this.consts.eveUUID.totalConsumption
    this.eveVoltage.UUID = this.consts.eveUUID.voltage
    this.eveElectricCurrent.UUID = this.consts.eveUUID.electricCurrent
    this.eveResetTotal.UUID = this.consts.eveUUID.resetTotal
    if (!this.funcs.hasProperty(this.accessory.context, 'energyReadings')) {
      this.accessory.context.energyReadings = []
    }
    if (!this.funcs.hasProperty(this.accessory.context, 'energyReadingTotal')) {
      this.accessory.context.energyReadingTotal = 0
    }

    if (this.accessory.getService(this.hapServ.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
    }
    if (!(this.service = this.accessory.getService(this.hapServ.Outlet))) {
      this.service = this.accessory.addService(this.hapServ.Outlet)
      this.service.addCharacteristic(this.eveVoltage)
      this.service.addCharacteristic(this.eveCurrentConsumption)
      this.service.addCharacteristic(this.eveElectricCurrent)
      this.service.addCharacteristic(this.eveTotalConsumption)
      this.service.addCharacteristic(this.eveResetTotal)
    }
    this.service.getCharacteristic(this.hapChar.On)
      .on('set', this.internalUpdate.bind(this))
    this.service.getCharacteristic(this.eveResetTotal)
      .on('set', (value, callback) => {
        callback()
        this.accessory.context.energyReadings = []
        this.accessory.context.energyReadingTotal = 0
        this.service.updateCharacteristic(this.eveTotalConsumption, 0)
      })
    this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
    this.accessory.historyService = new this.platform.eveService('energy', this.accessory, {
      storage: 'fs',
      path: platform.eveLogPath
    })
    setInterval(() => {
      let total = 0
      if (this.accessory.context.energyReadings.length > 0) {
        this.accessory.context.energyReadings.forEach(x => (total += x))
        total /= this.accessory.context.energyReadings.length // W5m
        total /= 12 // Wh
        total /= 1000 // kWh
        this.accessory.context.energyReadingTotal += total
      }
      this.accessory.context.energyReadings = []
      this.service.updateCharacteristic(this.eveTotalConsumption, this.accessory.context.energyReadingTotal)
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
        this.accessory.historyService.addEntry({
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
