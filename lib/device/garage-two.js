'use strict'
let Characteristic, Service
const utils = require('./../utils')
module.exports = class deviceGarageTwo {
  constructor (platform, accessory) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
    ;['1', '2'].forEach(v => {
      let gdService
      if (!(gdService = accessory.getService('Garage ' + v))) {
        accessory
          .addService(Service.GarageDoorOpener, 'Garage ' + v, 'garage' + v)
          .setCharacteristic(Characteristic.CurrentDoorState, 1)
          .setCharacteristic(Characteristic.TargetDoorState, 1)
          .setCharacteristic(Characteristic.ObstructionDetected, false)
        gdService = accessory.getService('Garage ' + v)
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

  externalUpdate (accessory, params) {
    try {
      if (!utils.hasProperty(params, 'switches')) {
        return
      }
      let garageConfig
      if (!(garageConfig = this.platform.cusG.get(accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (garageConfig.type !== 'garage_two') {
        throw new Error('improper configuration')
      }
      if (accessory.context.inUse || garageConfig.sensorId) {
        return
      }

      ;['1', '2'].forEach(async (v, k) => {
        const gcService = accessory.getService('Garage' + v)
        const prevState = k === 0
          ? accessory.context.cacheOneCurrentDoorState
          : accessory.context.cacheTwoCurrentDoorState
        const newPos = [0, 2].includes(prevState) ? 3 : 2
        switch (v) {
          case 'Garage 1':
            if (
              params.switches[0].switch === params.switches[1].switch ||
              params.switches[prevState % 2].switch === 'on'
            ) {
              return
            }
            break
          case 'Garage 2':
            if (
              params.switches[2].switch === params.switches[3].switch ||
              params.switches[(prevState % 2) + 2].switch === 'on'
            ) {
              return
            }
            break
        }
        accessory.context.inUse = true
        if (garageConfig.sensorId) {
          await utils.sleep(Math.max(garageConfig.operationTime * 100, 1000))
        } else {
          gcService
            .updateCharacteristic(Characteristic.TargetDoorState, newPos - 2)
            .updateCharacteristic(Characteristic.CurrentDoorState, newPos)
          switch (v) {
            case 'Garage 1':
              accessory.context.cacheOneCurrentDoorState = newPos
              accessory.context.cacheTwoTargetDoorState = newPos - 2
              break
            case 'Garage 2':
              accessory.context.cacheTwoCurrentDoorState = newPos
              accessory.context.cacheTwoTargetDoorState = newPos - 2
              break
          }
          await utils.sleep(Math.max(garageConfig.operationTime * 100, 1000))
          gcService.updateCharacteristic(Characteristic.CurrentDoorState, newPos - 2)
          switch (v) {
            case 'Garage 1':
              accessory.context.cacheOneCurrentDoorState = newPos - 2
              break
            case 'Garage 2':
              accessory.context.cacheTwoCurrentDoorState = newPos - 2
              break
          }
        }
      })
      accessory.context.inUse = false
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
