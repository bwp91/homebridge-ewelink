'use strict'
let Characteristic, EveService, Service
const hbLib = require('homebridge-lib')
module.exports = class deviceOutlet {
  constructor (platform, homebridge) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
    EveService = new hbLib.EveHomeKitTypes(platform.api)
  }

  async internalOutletUpdate (accessory, value, callback) {
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

  externalOutletUpdate (accessory, params) {
    try {
      const outletService = accessory.getService(Service.Outlet)
      if (Object.prototype.hasOwnProperty.call(params, 'switch')) {
        outletService.updateCharacteristic(Characteristic.On, params.switch === 'on')
        if (accessory.context.eweModel === 'S26' || this.platform.config.disableEveLogging) {
          outletService.updateCharacteristic(Characteristic.OutletInUse, params.switch === 'on')
        }
      }
      if (Object.prototype.hasOwnProperty.call(params, 'power')) {
        outletService.updateCharacteristic(EveService.Characteristics.CurrentConsumption, parseFloat(params.power))
        if (accessory.context.eweModel !== 'S26' && !this.platform.config.disableEveLogging) {
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
      if (Object.prototype.hasOwnProperty.call(params, 'voltage')) {
        outletService.updateCharacteristic(EveService.Characteristics.Voltage, parseFloat(params.voltage))
      }
      if (Object.prototype.hasOwnProperty.call(params, 'current')) {
        outletService.updateCharacteristic(EveService.Characteristics.ElectricCurrent, parseFloat(params.current))
      }
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
