/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const corrInterval = require('correcting-interval')
const fakegato = require('fakegato-history')
const hbLib = require('homebridge-lib')
const helpers = require('./../helpers')
module.exports = class deviceOutlet {
  constructor (platform, accessory) {
    this.platform = platform
    this.accessory = accessory
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.EveCharacteristics = new hbLib.EveHomeKitTypes(platform.api).Characteristics
    this.EveHistoryService = fakegato(platform.api)
    if (accessory.getService(this.Service.Switch)) {
      accessory.removeService(accessory.getService(this.Service.Switch))
    }
    let outletService
    if (!(outletService = accessory.getService(this.Service.Outlet))) {
      accessory.addService(this.Service.Outlet)
      outletService = accessory.getService(this.Service.Outlet)
      if (!helpers.devicesSingleSwitchOutlet.includes(accessory.context.eweModel) && !this.platform.config.disableEveLogging) {
        outletService.addCharacteristic(this.EveCharacteristics.Voltage)
        outletService.addCharacteristic(this.EveCharacteristics.CurrentConsumption)
        outletService.addCharacteristic(this.EveCharacteristics.ElectricCurrent)
        outletService.addCharacteristic(this.EveCharacteristics.TotalConsumption)
        outletService.addCharacteristic(this.EveCharacteristics.ResetTotal)
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
      .getCharacteristic(this.Characteristic.On)
      .on('set', (value, callback) => this.internalUpdate(value, callback))
    if (!helpers.devicesSingleSwitchOutlet.includes(accessory.context.eweModel) && !this.platform.config.disableEveLogging) {
      accessory.log = this.platform.log
      accessory.eveLogger = new this.EveHistoryService('energy', accessory, {
        storage: 'fs',
        minutes: 5,
        path: this.platform.eveLogPath
      })
      corrInterval.setCorrectingInterval(() => {
        const isOn = outletService.getCharacteristic(this.Characteristic.On).value
        const currentWatt = isOn
          ? outletService.getCharacteristic(this.EveCharacteristics.CurrentConsumption).value
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
        .getCharacteristic(this.EveCharacteristics.TotalConsumption)
        .on('get', callback => {
          accessory.context.extraPersistedData = accessory.eveLogger.getExtraPersistedData()
          if (accessory.context.extraPersistedData !== undefined) {
            accessory.context.totalEnergy = accessory.context.extraPersistedData.totalPower
          }
          callback(null, accessory.context.totalEnergy)
        })
      outletService
        .getCharacteristic(this.EveCharacteristics.ResetTotal)
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

  async internalUpdate (value, callback) {
    callback()
    try {
      const params = {
        switch: value ? 'on' : 'off'
      }
      const outletService = this.accessory.getService(this.Service.Outlet)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      outletService.updateCharacteristic(this.Characteristic.On, value)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      const outletService = this.accessory.getService(this.Service.Outlet)
      if (helpers.hasProperty(params, 'switch')) {
        outletService.updateCharacteristic(this.Characteristic.On, params.switch === 'on')
        if (helpers.devicesSingleSwitchOutlet.includes(this.accessory.context.eweModel) || this.platform.config.disableEveLogging) {
          outletService.updateCharacteristic(this.Characteristic.OutletInUse, params.switch === 'on')
        }
      }
      if (helpers.hasProperty(params, 'power')) {
        outletService.updateCharacteristic(this.EveCharacteristics.CurrentConsumption, parseFloat(params.power))
        if (!helpers.devicesSingleSwitchOutlet.includes(this.accessory.context.eweModel) && !this.platform.config.disableEveLogging) {
          outletService.updateCharacteristic(
            this.Characteristic.OutletInUse,
            parseFloat(params.power) > (this.platform.config.inUsePowerThreshold || 0)
          )
          const isOn = this.accessory.getService(this.Service.Outlet).getCharacteristic(this.Characteristic.On).value
          this.accessory.eveLogger.addEntry({
            time: Date.now(),
            power: isOn ? parseFloat(params.power) : 0
          })
        }
      }
      if (helpers.hasProperty(params, 'voltage')) {
        outletService.updateCharacteristic(this.EveCharacteristics.Voltage, parseFloat(params.voltage))
      }
      if (helpers.hasProperty(params, 'current')) {
        outletService.updateCharacteristic(this.EveCharacteristics.ElectricCurrent, parseFloat(params.current))
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
