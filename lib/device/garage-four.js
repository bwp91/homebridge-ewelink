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
      const garageConfig = this.platform.cusG.get(this.accessory.context.eweDeviceId)
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
      const prevState = this.accessory.context.cacheStates[garageChannel].cacheCurrentDoorState
      if (value === prevState % 2) return
      const gdService = this.accessory.getService('Garage ' + garage)
      this.inUse = true
      const updateKey = Math.random().toString(36).substr(2, 8)
      this.updateKey = updateKey
      gdService
        .updateCharacteristic(this.Characteristic.TargetDoorState, value)
        .updateCharacteristic(this.Characteristic.CurrentDoorState, value + 2)
      this.accessory.context.cacheStates[garageChannel].cacheTargetDoorState = value
      this.accessory.context.cacheStates[garageChannel].cacheCurrentDoorState = value + 2
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      ;[0, 1, 2, 3].forEach(i => (params.switches[i].switch = garageChannel === i ? 'on' : 'off'))
      await this.platform.sendDeviceUpdate(this.accessory, params)
      await this.helpers.sleep(2000)
      this.inUse = false
      await this.helpers.sleep(Math.max((garageConfig.operationTime - 20) * 100, 0))
      if (this.updateKey !== updateKey) return
      gdService.updateCharacteristic(this.Characteristic.CurrentDoorState, value)
      this.accessory.context.cacheStates[garageChannel].cacheCurrentDoorState = value
      this.log('[%s] current state [garage %s %s].', this.accessory.displayName, garageChannel, value === 0 ? 'open' : 'closed')
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {

    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
