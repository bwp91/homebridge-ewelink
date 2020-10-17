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
        .on('set', (value, callback) => this.internalUpdate(v, value, callback))
    })
    this.accessory = accessory
    this.platform.log.error(accessory.context)
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
      const tempLogger = msg => this.platform.log.warn('[%s] %s', this.accessory.displayName, msg)
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
      tempLogger('New position value requested - TargetDoorState: ' + value)
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
      tempLogger('sAccessory:' + sAccessory + ' as no sensor defined')
      const prevState = sAccessory
        ? sAccessory.getService(this.Service.ContactSensor).getCharacteristic(this.Characteristic.ContactSensorState).value === 0
          ? 1
          : 0
        : this.accessory.context.cacheStates[garageChannel].cacheCurrentDoorState
      tempLogger('Previous state retrieved as prevState:' + prevState)
      if (value === prevState % 2) return
      const gdService = this.accessory.getService('Garage ' + garage)
      this.accessory.context.inUse = true
      gdService
        .updateCharacteristic(this.Characteristic.TargetDoorState, value)
        .updateCharacteristic(this.Characteristic.CurrentDoorState, value + 2)
      this.accessory.context.cacheStates[garageChannel].cacheTargetDoorState = value
      this.accessory.context.cacheStates[garageChannel].cacheCurrentDoorState = value + 2
      const params = { switches: helpers.defaultMultiSwitchOff }
      params.switches[garageChannel].switch = 'on'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      await helpers.sleep(Math.max(garageConfig.operationTime * 100, 1000))
      if (!sAccessory) {
        gdService.updateCharacteristic(this.Characteristic.CurrentDoorState, value)
        this.accessory.context.cacheStates[garageChannel].cacheCurrentDoorState = value
      }
      this.accessory.context.inUse = false
    } catch (err) {
      this.accessory.context.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {

    } catch (err) {
      this.accessory.context.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
