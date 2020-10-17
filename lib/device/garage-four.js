/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const helpers = require('./../helpers')
module.exports = class deviceGarageFour {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    ;['1', '2', '3', '4'].forEach(v => {
      let gdService
      if (!(gdService = accessory.getService('Garage ' + v))) {
        accessory
          .addService(this.Service.GarageDoorOpener, 'Garage ' + v, 'garage' + v)
          .setCharacteristic(this.Characteristic.CurrentDoorState, 1)
          .setCharacteristic(this.Characteristic.TargetDoorState, 1)
          .setCharacteristic(this.Characteristic.ObstructionDetected, false)
        gdService = accessory.getService('Garage ' + v)
      }
      gdService
        .getCharacteristic(this.Characteristic.TargetDoorState)
        .on('set', (value, callback) => this.internalUpdate(v, value, callback))
    })
    this.accessory = accessory
  }

  async internalUpdate (garage, value, callback) {
    callback()
    try {
      let garageConfig
      if (!(garageConfig = this.platform.cusG.get(this.accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (garageConfig.type !== 'garage_four') {
        throw new Error('improper configuration')
      }
      const params = { switches: this.accessory.context.switchState }
      const gdService = this.accessory.getService('Garage ' + garage)
      if (value === gdService.getCharacteristic(this.Characteristic.CurrentDoorState).value % 2) return
      params.switches[parseInt(garage) - 1].switch = value === 0 ? 'on' : 'off'
      this.accessory.context.inUse = true
      await this.platform.sendDeviceUpdate(this.accessory, params)
      gdService
        .updateCharacteristic(this.Characteristic.TargetDoorState, value)
        .updateCharacteristic(this.Characteristic.CurrentDoorState, value + 2)
      await helpers.sleep(2000)
      this.accessory.context.inUse = false
      if (value === 0) {
        await helpers.sleep(Math.max((garageConfig.operationTime - 20) * 100, 0))
        gdService.updateCharacteristic(this.Characteristic.CurrentDoorState, 0)
      }
    } catch (err) {
      this.accessory.context.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!helpers.hasProperty(params, 'switch') || this.accessory.context.inUse) return
      let garageConfig
      if (!(garageConfig = this.platform.cusG.get(this.accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (garageConfig.type !== 'garage_four') {
        throw new Error('improper configuration')
      }
      this.accessory.context.switchState = params.switches
      this.accessory.context.inUse = true
      const gdService = this.accessory.getService(this.Service.GarageDoorOpener)
      gdService
        .updateCharacteristic(this.Characteristic.TargetDoorState, params.switch === 'on' ? 0 : 1)
        .updateCharacteristic(this.Characteristic.CurrentDoorState, params.switch === 'on' ? 0 : 1)
      this.accessory.context.inUse = false
    } catch (err) {
      this.accessory.context.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
