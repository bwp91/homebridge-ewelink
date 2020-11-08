/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const helpers = require('./../helpers')
module.exports = class deviceGarage {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    let gdService
    if (!(gdService = accessory.getService(this.Service.GarageDoorOpener))) {
      accessory
        .addService(this.Service.GarageDoorOpener)
        .setCharacteristic(this.Characteristic.CurrentDoorState, 1)
        .setCharacteristic(this.Characteristic.TargetDoorState, 1)
        .setCharacteristic(this.Characteristic.ObstructionDetected, false)
      gdService = accessory.getService(this.Service.GarageDoorOpener)
    }
    gdService
      .getCharacteristic(this.Characteristic.TargetDoorState)
      .on('set', (value, callback) => this.internalUpdate(accessory, value, callback))
  }

  async internalUpdate (accessory, value, callback) {
    try {
      callback()
      let garageConfig
      if (!(garageConfig = this.platform.cusG.get(accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (garageConfig.type !== 'garage' || !['oneSwitch', 'twoSwitch'].includes(garageConfig.setup)) {
        throw new Error('improper configuration')
      }
      const sensorDefinition = garageConfig.sensorId || false
      let sAccessory = false
      const newPos = value
      const params = {}
      let delay = 0
      const gdService = accessory.getService(this.Service.GarageDoorOpener)
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
        : accessory.context.cacheCurrentDoorState
      if (newPos === prevState % 2) return
      accessory.context.inUse = true
      accessory.context.state = value
      if (garageConfig.setup === 'oneSwitch' && [2, 3].includes(prevState)) {
        gdService.updateCharacteristic(this.Characteristic.CurrentDoorState, ((prevState * 2) % 3) + 2)
        accessory.context.cacheCurrentDoorState = ((prevState * 2) % 3) + 2
        delay = 1500
      }
      if (accessory.context.state !== newPos) return
      await helpers.sleep(delay)
      gdService
        .updateCharacteristic(this.Characteristic.TargetDoorState, newPos)
        .updateCharacteristic(this.Characteristic.CurrentDoorState, newPos + 2)
      accessory.context.cacheTargetDoorState = newPos
      accessory.context.cacheCurrentDoorState = newPos + 2
      switch (garageConfig.setup) {
        case 'oneSwitch':
          params.switch = 'on'
          break
        case 'twoSwitch':
          params.switches = helpers.defaultMultiSwitchOff
          params.switches[0].switch = newPos === 0 ? 'on' : 'off'
          params.switches[1].switch = newPos === 1 ? 'on' : 'off'
          break
      }
      await this.platform.sendDeviceUpdate(accessory, params)
      await helpers.sleep(Math.max(garageConfig.operationTime * 100, 1000))
      if (!sAccessory) {
        gdService.updateCharacteristic(this.Characteristic.CurrentDoorState, newPos)
        accessory.context.cacheCurrentDoorState = newPos
      }
      accessory.context.inUse = false
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {
      if (!helpers.hasProperty(params, 'switch') && !helpers.hasProperty(params, 'switches')) {
        return
      }
      let garageConfig
      const gcService = accessory.getService(this.Service.GarageDoorOpener)
      const prevState = accessory.context.cacheCurrentDoorState
      const newPos = [0, 2].includes(prevState) ? 3 : 2
      if (!(garageConfig = this.platform.cusG.get(accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (garageConfig.type !== 'garage' || !['oneSwitch', 'twoSwitch'].includes(garageConfig.setup)) {
        throw new Error('improper configuration')
      }
      if (accessory.context.inUse || garageConfig.sensorId) return
      switch (garageConfig.setup) {
        case 'oneSwitch':
          if (params.switch === 'off') {
            return
          }
          break
        case 'twoSwitch':
          if (
            params.switches[0].switch === params.switches[1].switch ||
            params.switches[prevState % 2].switch === 'on'
          ) {
            return
          }
          break
      }
      accessory.context.inUse = true
      if (garageConfig.sensorId) {
        await helpers.sleep(Math.max(garageConfig.operationTime * 100, 1000))
      } else {
        gcService
          .updateCharacteristic(this.Characteristic.TargetDoorState, newPos - 2)
          .updateCharacteristic(this.Characteristic.CurrentDoorState, newPos)
        accessory.context.cacheCurrentDoorState = newPos
        accessory.context.cacheTargetDoorState = newPos - 2
        await helpers.sleep(Math.max(garageConfig.operationTime * 100, 1000))
        gcService.updateCharacteristic(this.Characteristic.CurrentDoorState, newPos - 2)
        accessory.context.cacheCurrentDoorState = newPos - 2
      }
      accessory.context.inUse = false
    } catch (err) {
      accessory.context.inUse = false
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
