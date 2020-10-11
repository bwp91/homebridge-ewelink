'use strict'
let Characteristic, Service
const utils = require('./../utils')
module.exports = class deviceGarageTwo {
  constructor (platform, accessory) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
    const arr = ['1', '2']
    arr.forEach(v => {
      let gdService
      if (!(gdService = accessory.getService('Garage ' + v))) {
        accessory
          .addService(Service.GarageDoorOpener, 'Garage ' + v, 'garage' + v)
          .setCharacteristic(Characteristic.CurrentDoorState, 1)
          .setCharacteristic(Characteristic.TargetDoorState, 1)
          .setCharacteristic(Characteristic.ObstructionDetected, false)
        gdService = accessory.getService('Garage ' + v))
      }
      gdService
        .getCharacteristic(Characteristic.TargetDoorState)
        .on('set', (value, callback) => this.internalUpdate(accessory, 'Garage' + v, value, callback))
    })
  }

  async internalUpdate (accessory, garage, value, callback) {
    callback()
    try {

    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {

    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
