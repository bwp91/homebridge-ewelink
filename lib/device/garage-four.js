/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const helpers = require('./../helpers')
module.exports = class deviceGarageFour {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    ;['A', 'B', 'C', 'D'].forEach(v => {
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
        .on('set', (value, callback) => this.internalUpdate(accessory, v, value, callback))
    })
  }

  async internalUpdate (accessory, garage, value, callback) {
    callback()
    try {
      let garageConfig
      if (!(garageConfig = this.platform.cusG.get(accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (garageConfig.type !== 'garage_four') {
        throw new Error('improper configuration')
      }
      let garageChannel
      switch (garage) {
        case 'A':
          garageChannel = 0
          break
        case 'B':
          garageChannel = 1
          break
        case 'C':
          garageChannel = 2
          break
        case 'D':
          garageChannel = 3
          break
      }
      let sensorDefinition = garageConfig.sensorId || false
      if (sensorDefinition) {
        const sensors = garageConfig.sensorId.split(',')
        sensorDefinition = sensors[garageChannel] || false
      }
      let sAccessory = false
      if (sensorDefinition && !(sAccessory = this.platform.devicesInHB.get(garageConfig.sensorId + 'SWX'))) {
        throw new Error("defined DW2 sensor doesn't exist")
      }
      if (sensorDefinition && sAccessory.context.type !== 'sensor') {
        throw new Error("defined DW2 sensor isn't a sensor")
      }
      const prevState = sAccessory
        ? sAccessory.getService(this.Service.ContactSensor).getCharacteristic(this.Characteristic.ContactSensorState).value === 0
          ? 1
          : 0
        : accessory.context.cacheStates[garageChannel].cacheCurrentDoorState
      if (value === prevState % 2) return
      const gdService = accessory.getService('Garage ' + garage)
      accessory.context.inUse = true
      const updateKey = Math.random().toString(36).substr(2, 8)
      accessory.context.updateKey = updateKey
      gdService
        .updateCharacteristic(this.Characteristic.TargetDoorState, value)
        .updateCharacteristic(this.Characteristic.CurrentDoorState, value + 2)
      accessory.context.cacheStates[garageChannel].cacheTargetDoorState = value
      accessory.context.cacheStates[garageChannel].cacheCurrentDoorState = value + 2
      const params = { switches: helpers.defaultMultiSwitchOff }
      ;[0, 1, 2, 3].forEach(i => (params.switches[i].switch = garageChannel === i ? 'on' : 'off'))
      await this.platform.sendDeviceUpdate(accessory, params)
      await helpers.sleep(1000)
      accessory.context.inUse = false
      await helpers.sleep(Math.max((garageConfig.operationTime - 10) * 100, 0))
      if (accessory.context.updateKey !== updateKey || sAccessory) return
      if (!sAccessory) {
        gdService.updateCharacteristic(this.Characteristic.CurrentDoorState, value)
        accessory.context.cacheStates[garageChannel].cacheCurrentDoorState = value
      }
    } catch (err) {
      accessory.context.inUse = false
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {
      if (!helpers.hasProperty(params, 'switches') || accessory.context.inUse) return
      let garageConfig
      if (!(garageConfig = this.platform.cusG.get(accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (garageConfig.type !== 'garage_four') {
        throw new Error('improper configuration')
      }
      if (accessory.context.inUse) return
      ;['A', 'B', 'C', 'D'].forEach(async v => {
        let garageChannel
        switch (v) {
          case 'A':
            garageChannel = 0
            break
          case 'B':
            garageChannel = 1
            break
          case 'C':
            garageChannel = 2
            break
          case 'D':
            garageChannel = 3
            break
        }
        let sensorDefinition = garageConfig.sensorId || false
        if (sensorDefinition) {
          const sensors = garageConfig.sensorId.split(',')
          sensorDefinition = sensors[garageChannel] || false
        }
        let sAccessory = false
        if (sensorDefinition && !(sAccessory = this.platform.devicesInHB.get(garageConfig.sensorId + 'SWX'))) {
          throw new Error("defined DW2 sensor doesn't exist")
        }
        if (sensorDefinition && sAccessory.context.type !== 'sensor') {
          throw new Error("defined DW2 sensor isn't a sensor")
        }
        if (sensorDefinition) return
        const gcService = accessory.getService('Garage ' + v)
        const prevState = accessory.context.cacheStates[garageChannel].cacheCurrentDoorState
        const newPos = [0, 2].includes(prevState) ? 1 : 0
        if (params.switches[garageChannel].switch === 'off') return
        gcService.updateCharacteristic(this.Characteristic.CurrentDoorState, newPos)
        accessory.context.cacheStates[garageChannel].cacheTargetDoorState = newPos
        accessory.context.cacheStates[garageChannel].cacheCurrentDoorState = newPos
      })
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
