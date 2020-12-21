/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceGarage {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    if (!(this.gdService = accessory.getService(this.Service.GarageDoorOpener))) {
      accessory
        .addService(this.Service.GarageDoorOpener)
        .setCharacteristic(this.Characteristic.CurrentDoorState, 1)
        .setCharacteristic(this.Characteristic.TargetDoorState, 1)
        .setCharacteristic(this.Characteristic.ObstructionDetected, false)
      this.gdService = accessory.getService(this.Service.GarageDoorOpener)
    }
    this.gdService
      .getCharacteristic(this.Characteristic.TargetDoorState)
      .on('set', this.internalUpdate.bind(this))
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      let garageConfig
      if (!(garageConfig = this.platform.cusG.get(this.accessory.context.hbDeviceId))) {
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
        : this.accessory.context.cacheCurrentDoorState
      if (newPos === prevState % 2) return
      this.accessory.context.inUse = true
      this.accessory.context.state = value
      if (garageConfig.setup === 'oneSwitch' && [2, 3].includes(prevState)) {
        this.gdService.updateCharacteristic(this.Characteristic.CurrentDoorState, ((prevState * 2) % 3) + 2)
        this.accessory.context.cacheCurrentDoorState = ((prevState * 2) % 3) + 2
        delay = 1500
      }
      if (this.accessory.context.state !== newPos) return
      await this.helpers.sleep(delay)
      this.gdService
        .updateCharacteristic(this.Characteristic.TargetDoorState, newPos)
        .updateCharacteristic(this.Characteristic.CurrentDoorState, newPos + 2)
      this.accessory.context.cacheTargetDoorState = newPos
      this.accessory.context.cacheCurrentDoorState = newPos + 2
      switch (garageConfig.setup) {
        case 'oneSwitch':
          params.switch = 'on'
          break
        case 'twoSwitch':
          params.switches = this.helpers.defaultMultiSwitchOff
          params.switches[0].switch = newPos === 0 ? 'on' : 'off'
          params.switches[1].switch = newPos === 1 ? 'on' : 'off'
          break
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      await this.helpers.sleep(Math.max(garageConfig.operationTime * 100, 1000))
      if (!sAccessory) {
        this.gdService.updateCharacteristic(this.Characteristic.CurrentDoorState, newPos)
        this.accessory.context.cacheCurrentDoorState = newPos
      }
      this.accessory.context.inUse = false
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!this.helpers.hasProperty(params, 'switch') && !this.helpers.hasProperty(params, 'switches')) {
        return
      }
      let garageConfig
      const prevState = this.accessory.context.cacheCurrentDoorState
      const newPos = [0, 2].includes(prevState) ? 3 : 2
      if (!(garageConfig = this.platform.cusG.get(this.accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (garageConfig.type !== 'garage' || !['oneSwitch', 'twoSwitch'].includes(garageConfig.setup)) {
        throw new Error('improper configuration')
      }
      if (this.accessory.context.inUse || garageConfig.sensorId) return
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
      this.accessory.context.inUse = true
      if (garageConfig.sensorId) {
        await this.helpers.sleep(Math.max(garageConfig.operationTime * 100, 1000))
      } else {
        this.gdService
          .updateCharacteristic(this.Characteristic.TargetDoorState, newPos - 2)
          .updateCharacteristic(this.Characteristic.CurrentDoorState, newPos)
        this.accessory.context.cacheCurrentDoorState = newPos
        this.accessory.context.cacheTargetDoorState = newPos - 2
        await this.helpers.sleep(Math.max(garageConfig.operationTime * 100, 1000))
        this.gdService.updateCharacteristic(this.Characteristic.CurrentDoorState, newPos - 2)
        this.accessory.context.cacheCurrentDoorState = newPos - 2
      }
      this.accessory.context.inUse = false
    } catch (err) {
      this.accessory.context.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
