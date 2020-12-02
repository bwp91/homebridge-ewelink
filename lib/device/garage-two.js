/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceGarageTwo {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    ;['1', '2'].forEach(v => {
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
        .on('set', (value, callback) => this.internalUpdate('Garage' + v, value, callback))
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
      if (garageConfig.type !== 'garage_two') {
        throw new Error('improper configuration')
      }
      let sensorDefinition = garageConfig.sensorId || false
      if (sensorDefinition) {
        const sensors = garageConfig.sensorId.split(',')
        switch (garage) {
          case 'Garage 1': {
            sensorDefinition = sensors[0] || false
            break
          }
          case 'Garage 2': {
            sensorDefinition = sensors[1] || false
            break
          }
        }
      }
      let sAccessory = false
      const newPos = value
      const params = { switches: this.accessory.context.switchState }
      const gdService = this.accessory.getService(garage)
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
        : garage === 'Garage 1'
          ? this.accessory.context.cacheOneCurrentDoorState
          : this.accessory.context.cacheTwoCurrentDoorState
      if (newPos === prevState % 2) return
      this.accessory.context.inUse = true
      gdService
        .updateCharacteristic(this.Characteristic.TargetDoorState, newPos)
        .updateCharacteristic(this.Characteristic.CurrentDoorState, newPos + 2)
      switch (garage) {
        case 'Garage 1': {
          this.accessory.context.cacheOneTargetDoorState = newPos
          this.accessory.context.cacheOneCurrentDoorState = newPos + 2
          params.switches[0].switch = newPos === 0 ? 'on' : 'off'
          params.switches[1].switch = newPos === 1 ? 'on' : 'off'
          break
        }
        case 'Garage 2': {
          this.accessory.context.cacheTwoTargetDoorState = newPos
          this.accessory.context.cacheTwoCurrentDoorState = newPos + 2
          params.switches[2].switch = newPos === 0 ? 'on' : 'off'
          params.switches[3].switch = newPos === 1 ? 'on' : 'off'
          break
        }
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      await this.helpers.sleep(Math.max(garageConfig.operationTime * 100, 1000))
      if (!sAccessory) {
        gdService.updateCharacteristic(this.Characteristic.CurrentDoorState, newPos)
        switch (garage) {
          case 'Garage 1': {
            this.accessory.context.cacheOneCurrentDoorState = newPos
            break
          }
          case 'Garage 2': {
            this.accessory.context.cacheTwoCurrentDoorState = newPos
            break
          }
        }
      }
      this.accessory.context.inUse = false
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  externalUpdate (params) {
    try {
      if (!this.helpers.hasProperty(params, 'switches')) {
        return
      }
      let garageConfig
      if (!(garageConfig = this.platform.cusG.get(this.accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (garageConfig.type !== 'garage_two') {
        throw new Error('improper configuration')
      }
      if (this.accessory.context.inUse || garageConfig.sensorId) return
      this.accessory.context.switchState = params.switches
      ;['1', '2'].forEach(async v => {
        const gcService = this.accessory.getService('Garage ' + v)
        const prevState = v === '1'
          ? this.accessory.context.cacheOneCurrentDoorState
          : this.accessory.context.cacheTwoCurrentDoorState
        const newPos = [0, 2].includes(prevState) ? 3 : 2
        switch (v) {
          case '1':
            if (
              params.switches[0].switch === params.switches[1].switch ||
              params.switches[prevState % 2].switch === 'on'
            ) {
              return
            }
            break
          case '2':
            if (
              params.switches[2].switch === params.switches[3].switch ||
              params.switches[(prevState % 2) + 2].switch === 'on'
            ) {
              return
            }
            break
        }
        this.accessory.context.inUse = true
        if (garageConfig.sensorId) {
          await this.helpers.sleep(Math.max(garageConfig.operationTime * 100, 1000))
        } else {
          gcService
            .updateCharacteristic(this.Characteristic.TargetDoorState, newPos - 2)
            .updateCharacteristic(this.Characteristic.CurrentDoorState, newPos)
          switch (v) {
            case '1':
              this.accessory.context.cacheOneCurrentDoorState = newPos
              this.accessory.context.cacheTwoTargetDoorState = newPos - 2
              break
            case '2':
              this.accessory.context.cacheTwoCurrentDoorState = newPos
              this.accessory.context.cacheTwoTargetDoorState = newPos - 2
              break
          }
          await this.helpers.sleep(Math.max(garageConfig.operationTime * 100, 1000))
          gcService.updateCharacteristic(this.Characteristic.CurrentDoorState, newPos - 2)
          switch (v) {
            case '1':
              this.accessory.context.cacheOneCurrentDoorState = newPos - 2
              break
            case '2':
              this.accessory.context.cacheTwoCurrentDoorState = newPos - 2
              break
          }
        }
      })
      this.accessory.context.inUse = false
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
