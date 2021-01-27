/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceGarageOne {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    this.dName = accessory.displayName
    this.accessory = accessory

    const asConfig = platform.cusG.get(this.accessory.context.eweDeviceId)
    if (!['oneSwitch', 'twoSwitch'].includes(asConfig.setup)) {
      this.error = 'setup must be oneSwitch or twoSwitch'
    }
    this.setup = asConfig.setup
    this.operationTime = parseInt(asConfig.operationTime)
    this.operationTime = isNaN(this.operationTime) || this.operationTime < 20
      ? this.helpers.defaults.operationTime
      : this.operationTime
    if (asConfig.sensorId) {
      if (!this.platform.devicesInHB.has(asConfig.sensorId + 'SWX')) {
        this.error = 'defined sensor does not exist in Homebridge'
      }
      if (this.platform.devicesInHB.get(asConfig.sensorId + 'SWX').context.type !== 'sensor') {
        this.error = 'defined sensor is not a DW2 sensor'
      }
      this.definedSensor = this.platform.devicesInHB.get(asConfig.sensorId + 'SWX')
    }

    if (!(this.service = this.accessory.getService(this.S.GarageDoorOpener))) {
      this.accessory.addService(this.S.GarageDoorOpener)
        .setCharacteristic(this.C.CurrentDoorState, 1)
        .setCharacteristic(this.C.TargetDoorState, 1)
        .setCharacteristic(this.C.ObstructionDetected, false)
      this.service = this.accessory.getService(this.S.GarageDoorOpener)
    }
    this.service.getCharacteristic(this.C.TargetDoorState)
      .on('set', this.internalUpdate.bind(this))
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      if (this.error) {
        this.log.warn('[%s] invalid config - %s.', this.dName, this.error)
        return
      }
      const newPos = value
      const params = {}
      let delay = 0
      const prevState = this.definedSensor
        ? this.definedSensor.getService(this.S.ContactSensor).getCharacteristic(this.C.ContactSensorState).value === 0
          ? 1
          : 0
        : this.accessory.context.cacheCurrentDoorState
      if (newPos === prevState % 2) {
        return
      }
      this.inUse = true
      this.cacheState = value
      if (this.setup === 'oneSwitch' && [2, 3].includes(prevState)) {
        this.service.updateCharacteristic(this.C.CurrentDoorState, ((prevState * 2) % 3) + 2)
        this.accessory.context.cacheCurrentDoorState = ((prevState * 2) % 3) + 2
        delay = 1500
      }
      if (this.cacheState !== newPos) {
        return
      }
      await this.helpers.sleep(delay)
      this.service.updateCharacteristic(this.C.TargetDoorState, newPos)
        .updateCharacteristic(this.C.CurrentDoorState, newPos + 2)
      this.accessory.context.cacheTargetDoorState = newPos
      this.accessory.context.cacheCurrentDoorState = newPos + 2
      switch (this.setup) {
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
      await this.helpers.sleep(2000)
      this.inUse = false
      await this.helpers.sleep(Math.max((this.operationTime - 20) * 100, 0))
      if (!this.definedSensor) {
        this.service.updateCharacteristic(this.C.CurrentDoorState, newPos)
        this.accessory.context.cacheCurrentDoorState = newPos
        if (!this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.dName, newPos === 0 ? 'open' : 'closed')
        }
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.error) {
        this.log.warn('[%s] invalid config - %s.', this.dName, this.error)
        return
      }
      if ((!params.switch && !params.switches) || this.inUse || this.definedSensor) {
        return
      }
      const prevState = this.accessory.context.cacheCurrentDoorState
      const newPos = [0, 2].includes(prevState) ? 3 : 2
      switch (this.setup) {
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
      this.inUse = true
      this.service.updateCharacteristic(this.C.TargetDoorState, newPos - 2)
        .updateCharacteristic(this.C.CurrentDoorState, newPos)
      this.accessory.context.cacheCurrentDoorState = newPos
      this.accessory.context.cacheTargetDoorState = newPos - 2
      await this.helpers.sleep(2000)
      this.inUse = false
      await this.helpers.sleep(Math.max((this.operationTime - 20) * 100, 0))
      this.service.updateCharacteristic(this.C.CurrentDoorState, newPos - 2)
      this.accessory.context.cacheCurrentDoorState = newPos - 2
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.dName, newPos === 2 ? 'open' : 'closed')
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
