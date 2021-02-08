/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceGarageOne {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up the accessory with default positions when added the first time
    if (!this.funcs.hasProperty(this.accessory.context, 'cacheCurrentDoorState')) {
      this.accessory.context.cacheCurrentDoorState = 1
      this.accessory.context.cacheTargetDoorState = 1
    }

    // Validate the user config
    const asConfig = platform.simulations[this.accessory.context.eweDeviceId]
    if (!['oneSwitch', 'twoSwitch'].includes(asConfig.setup)) {
      this.error = 'setup must be oneSwitch or twoSwitch'
    }
    this.setup = asConfig.setup

    // Set up custom variables for this device type
    this.operationTime = asConfig.operationTime

    // Check the sensor is valid if defined by the user
    if (asConfig.sensorId) {
      // Check the sensor exists in Homebridge
      if (!platform.devicesInHB.has(asConfig.sensorId + 'SWX')) {
        this.error = 'defined sensor does not exist in Homebridge'
      }

      // Check the sensor is a sensor
      if (platform.devicesInHB.get(asConfig.sensorId + 'SWX').context.eweUIID !== 102) {
        this.error = 'defined sensor is not a DW2 sensor'
      }
      this.definedSensor = this.platform.devicesInHB.get(asConfig.sensorId + 'SWX')
    }

    // Add the garage door service if it doesn't already exist
    if (!(this.service = this.accessory.getService(this.hapServ.GarageDoorOpener))) {
      this.accessory.addService(this.hapServ.GarageDoorOpener)
        .setCharacteristic(this.hapChar.CurrentDoorState, 1)
        .setCharacteristic(this.hapChar.TargetDoorState, 1)
        .setCharacteristic(this.hapChar.ObstructionDetected, false)
      this.service = this.accessory.getService(this.hapServ.GarageDoorOpener)
    }

    // Add the set handler to the target position characteristic
    this.service.getCharacteristic(this.hapChar.TargetDoorState)
      .on('set', this.internalUpdate.bind(this))
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      if (this.error) {
        this.log.warn('[%s] invalid config - %s.', this.name, this.error)
        return
      }
      const newPos = value
      const params = {}
      let delay = 0
      const prevState = this.definedSensor
        ? this.definedSensor.getService(this.hapServ.ContactSensor).getCharacteristic(this.hapChar.ContactSensorState).value === 0
          ? 1
          : 0
        : this.accessory.context.cacheCurrentDoorState
      if (newPos === prevState % 2) {
        return
      }
      this.inUse = true
      this.cacheState = value
      if (this.setup === 'oneSwitch' && [2, 3].includes(prevState)) {
        this.service.updateCharacteristic(this.hapChar.CurrentDoorState, ((prevState * 2) % 3) + 2)
        this.accessory.context.cacheCurrentDoorState = ((prevState * 2) % 3) + 2
        delay = 1500
      }
      if (this.cacheState !== newPos) {
        return
      }
      await this.funcs.sleep(delay)
      this.service.updateCharacteristic(this.hapChar.TargetDoorState, newPos)
        .updateCharacteristic(this.hapChar.CurrentDoorState, newPos + 2)
      this.accessory.context.cacheTargetDoorState = newPos
      this.accessory.context.cacheCurrentDoorState = newPos + 2
      switch (this.setup) {
        case 'oneSwitch':
          params.switch = 'on'
          break
        case 'twoSwitch':
          params.switches = this.consts.defaultMultiSwitchOff
          params.switches[0].switch = newPos === 0 ? 'on' : 'off'
          params.switches[1].switch = newPos === 1 ? 'on' : 'off'
          break
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      await this.funcs.sleep(2000)
      this.inUse = false
      await this.funcs.sleep(Math.max((this.operationTime - 20) * 100, 0))
      if (!this.definedSensor) {
        this.service.updateCharacteristic(this.hapChar.CurrentDoorState, newPos)
        this.accessory.context.cacheCurrentDoorState = newPos
        if (!this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.name, newPos === 0 ? 'open' : 'closed')
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
        this.log.warn('[%s] invalid config - %s.', this.name, this.error)
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
      this.service.updateCharacteristic(this.hapChar.TargetDoorState, newPos - 2)
        .updateCharacteristic(this.hapChar.CurrentDoorState, newPos)
      this.accessory.context.cacheCurrentDoorState = newPos
      this.accessory.context.cacheTargetDoorState = newPos - 2
      await this.funcs.sleep(2000)
      this.inUse = false
      await this.funcs.sleep(Math.max((this.operationTime - 20) * 100, 0))
      this.service.updateCharacteristic(this.hapChar.CurrentDoorState, newPos - 2)
      this.accessory.context.cacheCurrentDoorState = newPos - 2
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, newPos === 2 ? 'open' : 'closed')
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
