/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceGarageFour {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
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
        .on('set', (value, callback) => this.internalUpdate(v, value, callback))
    })
    this.accessory = accessory
  }

  async internalUpdate (garage, value, callback) {
    try {
      callback()
      let garageConfig
      if (!(garageConfig = this.platform.cusG.get(this.accessory.context.hbDeviceId))) {
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
        : this.accessory.context.cacheStates[garageChannel].cacheCurrentDoorState
      if (value === prevState % 2) return
      const gdService = this.accessory.getService('Garage ' + garage)
      this.accessory.context.inUse = true
      const updateKey = Math.random().toString(36).substr(2, 8)
      this.accessory.context.updateKey = updateKey
      gdService
        .updateCharacteristic(this.Characteristic.TargetDoorState, value)
        .updateCharacteristic(this.Characteristic.CurrentDoorState, value + 2)
      this.accessory.context.cacheStates[garageChannel].cacheTargetDoorState = value
      this.accessory.context.cacheStates[garageChannel].cacheCurrentDoorState = value + 2
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      ;[0, 1, 2, 3].forEach(i => (params.switches[i].switch = garageChannel === i ? 'on' : 'off'))
      await this.platform.sendDeviceUpdate(this.accessory, params)
      await this.helpers.sleep(2000)
      this.accessory.context.inUse = false
      await this.helpers.sleep(Math.max((garageConfig.operationTime - 20) * 100, 0))
      if (this.accessory.context.updateKey !== updateKey || sAccessory) return
      if (!sAccessory) {
        gdService.updateCharacteristic(this.Characteristic.CurrentDoorState, value)
        this.accessory.context.cacheStates[garageChannel].cacheCurrentDoorState = value
      }
    } catch (err) {
      this.accessory.context.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      /*
      if (!this.helpers.hasProperty(params, 'switches') || this.accessory.context.inUse) return
      let garageConfig
      if (!(garageConfig = this.platform.cusG.get(this.accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (garageConfig.type !== 'garage_four') {
        throw new Error('improper configuration')
      }
      if (this.accessory.context.inUse) return
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
        const gcService = this.accessory.getService('Garage ' + v)
        const prevState = this.accessory.context.cacheStates[garageChannel].cacheCurrentDoorState
        const newPos = [0, 2].includes(prevState) ? 1 : 0
        if (params.switches[garageChannel].switch === 'off') return
        gcService.updateCharacteristic(this.Characteristic.CurrentDoorState, newPos)
        this.accessory.context.cacheStates[garageChannel].cacheTargetDoorState = newPos
        this.accessory.context.cacheStates[garageChannel].cacheCurrentDoorState = newPos
      })
      */
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
