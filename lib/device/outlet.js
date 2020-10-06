'use strict'
let Characteristic, EveHistoryService, EveService, Service
const cns = require('./../constants')
const corrInterval = require('correcting-interval')
const fakegato = require('fakegato-history')
const hbLib = require('homebridge-lib')
const utils = require('./../utils')
module.exports = class deviceOutlet {
  constructor (platform, accessory) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
    EveService = new hbLib.EveHomeKitTypes(platform.api)
    EveHistoryService = fakegato(platform.api)
    if (accessory.getService(Service.Switch)) {
      accessory.removeService(accessory.getService(Service.Switch))
    }
    let outletService
    if (!(outletService = accessory.getService(Service.Outlet))) {
      accessory.addService(Service.Outlet)
      outletService = accessory.getService(Service.Outlet)
      if (!cns.devicesSingleSwitchOutlet.includes(accessory.context.eweModel) && !this.platform.config.disableEveLogging) {
        outletService.addCharacteristic(EveService.Characteristics.Voltage)
        outletService.addCharacteristic(EveService.Characteristics.CurrentConsumption)
        outletService.addCharacteristic(EveService.Characteristics.ElectricCurrent)
        outletService.addCharacteristic(EveService.Characteristics.TotalConsumption)
        outletService.addCharacteristic(EveService.Characteristics.ResetTotal)
        accessory.context = {
          ...accessory.context,
          ...{
            extraPersistedData: {},
            lastReset: 0,
            totalEnergy: 0,
            totalEnergyTemp: 0
          }
        }
      }
    }
    outletService
      .getCharacteristic(Characteristic.On)
      .on('set', (value, callback) => this.internalUpdate(accessory, value, callback))
    if (!cns.devicesSingleSwitchOutlet.includes(accessory.context.eweModel) && !this.platform.config.disableEveLogging) {
      accessory.log = this.platform.log
      accessory.eveLogger = new EveHistoryService('energy', accessory, {
        storage: 'fs',
        minutes: 5,
        path: this.platform.eveLogPath
      })
      corrInterval.setCorrectingInterval(() => {
        const isOn = outletService.getCharacteristic(Characteristic.On).value
        const currentWatt = isOn
          ? outletService.getCharacteristic(EveService.Characteristics.CurrentConsumption).value
          : 0
        if (accessory.eveLogger.isHistoryLoaded()) {
          accessory.context.extraPersistedData = accessory.eveLogger.getExtraPersistedData()
          if (accessory.context.extraPersistedData !== undefined) {
            accessory.context.totalEnergy =
              accessory.context.extraPersistedData.totalenergy +
              accessory.context.totalEnergyTemp +
              (currentWatt * 10) / 3600 / 1000
            accessory.eveLogger.setExtraPersistedData({
              totalenergy: accessory.context.totalEnergy,
              lastReset: accessory.context.extraPersistedData.lastReset
            })
          } else {
            accessory.context.totalEnergy = accessory.context.totalEnergyTemp + (currentWatt * 10) / 3600 / 1000
            accessory.eveLogger.setExtraPersistedData({
              totalenergy: accessory.context.totalEnergy,
              lastReset: 0
            })
          }
          accessory.context.totalEnergytemp = 0
        } else {
          accessory.context.totalEnergyTemp += (currentWatt * 10) / 3600 / 1000
          accessory.context.totalEnergy = accessory.context.totalEnergyTemp
        }
        accessory.eveLogger.addEntry({
          time: Date.now(),
          power: currentWatt
        })
      }, 300000)
      outletService
        .getCharacteristic(EveService.Characteristics.TotalConsumption)
        .on('get', callback => {
          accessory.context.extraPersistedData = accessory.eveLogger.getExtraPersistedData()
          if (accessory.context.extraPersistedData !== undefined) {
            accessory.context.totalEnergy = accessory.context.extraPersistedData.totalPower
          }
          callback(null, accessory.context.totalEnergy)
        })
      outletService
        .getCharacteristic(EveService.Characteristics.ResetTotal)
        .on('set', (value, callback) => {
          accessory.context.totalEnergy = 0
          accessory.context.lastReset = value
          accessory.eveLogger.setExtraPersistedData({
            totalPower: 0,
            lastReset: value
          })
          callback()
        })
        .on('get', callback => {
          accessory.context.extraPersistedData = accessory.eveLogger.getExtraPersistedData()
          if (accessory.context.extraPersistedData !== undefined) {
            accessory.context.lastReset = accessory.context.extraPersistedData.lastReset
          }
          callback(null, accessory.context.lastReset)
        })
    }
  }

  async internalUpdate (accessory, value, callback) {
    callback()
    try {
      const params = {
        switch: value ? 'on' : 'off'
      }
      const outletService = accessory.getService(Service.Outlet)
      await this.platform.sendDeviceUpdate(accessory, params)
      outletService.updateCharacteristic(Characteristic.On, value)
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {
      const outletService = accessory.getService(Service.Outlet)
      if (utils.hasProperty(params, 'switch')) {
        outletService.updateCharacteristic(Characteristic.On, params.switch === 'on')
        if (cns.devicesSingleSwitchOutlet.includes(accessory.context.eweModel) || this.platform.config.disableEveLogging) {
          outletService.updateCharacteristic(Characteristic.OutletInUse, params.switch === 'on')
        }
      }
      if (utils.hasProperty(params, 'power')) {
        outletService.updateCharacteristic(EveService.Characteristics.CurrentConsumption, parseFloat(params.power))
        if (!cns.devicesSingleSwitchOutlet.includes(accessory.context.eweModel) && !this.platform.config.disableEveLogging) {
          outletService.updateCharacteristic(
            Characteristic.OutletInUse,
            parseFloat(params.power) > (this.platform.config.inUsePowerThreshold || 0)
          )
          const isOn = accessory.getService(Service.Outlet).getCharacteristic(Characteristic.On).value
          accessory.eveLogger.addEntry({
            time: Date.now(),
            power: isOn ? parseFloat(params.power) : 0
          })
        }
      }
      if (utils.hasProperty(params, 'voltage')) {
        outletService.updateCharacteristic(EveService.Characteristics.Voltage, parseFloat(params.voltage))
      }
      if (utils.hasProperty(params, 'current')) {
        outletService.updateCharacteristic(EveService.Characteristics.ElectricCurrent, parseFloat(params.current))
      }
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
