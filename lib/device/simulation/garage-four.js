/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceGarageFour {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.simulations[deviceId]
    this.operationTimeUp = deviceConf.operationTime ||
      this.consts.defaultValues.operationTime
    this.operationTimeDown = deviceConf.operationTimeDown || this.operationTimeUp
    this.disableDeviceLogging = deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Set up the accessory with default positions when added the first time
    if (!this.funcs.hasProperty(this.accessory.context, 'cacheStates')) {
      this.accessory.context.cacheStates = [
        { cacheCurrentDoorState: 1, cacheTargetDoorState: 1 },
        { cacheCurrentDoorState: 1, cacheTargetDoorState: 1 },
        { cacheCurrentDoorState: 1, cacheTargetDoorState: 1 },
        { cacheCurrentDoorState: 1, cacheTargetDoorState: 1 }
      ]
    }

    // We want four garage door services for this accessory
    ;['A', 'B', 'C', 'D'].forEach(v => {
      // Add the garage door service if it doesn't already exist
      let gdService
      if (!(gdService = this.accessory.getService('Garage ' + v))) {
        gdService = this.accessory.addService(
          this.hapServ.GarageDoorOpener,
          'Garage ' + v,
          'garage' + v
        )
        gdService.setCharacteristic(this.hapChar.CurrentDoorState, 1)
          .setCharacteristic(this.hapChar.TargetDoorState, 1)
          .setCharacteristic(this.hapChar.ObstructionDetected, false)
      }

      // Add the set handler to the target position characteristic
      gdService.getCharacteristic(this.hapChar.TargetDoorState)
        .on('set', (value, callback) => this.internalUpdate(v, value, callback))
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        operationTimeDown: this.operationTimeDown,
        operationTimeUp: this.operationTimeUp,
        type: deviceConf.type
      })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async internalUpdate (garage, value, callback) {
    try {
      callback()
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
      const prevState = this.accessory.context.cacheStates[garageChannel]
        .cacheCurrentDoorState
      if (value === prevState % 2) {
        return
      }
      const gdService = this.accessory.getService('Garage ' + garage)
      this.inUse = true
      const updateKey = Math.random().toString(36).substr(2, 8)
      this.updateKey = updateKey
      gdService.updateCharacteristic(this.hapChar.TargetDoorState, value)
        .updateCharacteristic(this.hapChar.CurrentDoorState, value + 2)
      this.accessory.context.cacheStates[garageChannel].cacheTargetDoorState = value
      this.accessory.context.cacheStates[garageChannel].cacheCurrentDoorState = value + 2
      const params = {
        switches: this.accessory.context.eweUIID === 126
          ? this.consts.defaultDoubleSwitchOff
          : this.consts.defaultMultiSwitchOff
      }
      ;[0, 1, 2, 3].forEach(i => {
        params.switches[i].switch = garageChannel === i ? 'on' : 'off'
      })
      await this.platform.sendDeviceUpdate(this.accessory, params)
      await this.funcs.sleep(2000)
      this.inUse = false
      const operationTime = value === 0 ? this.operationTimeUp : this.operationTimeDown
      await this.funcs.sleep(Math.max((operationTime - 20) * 100, 0))
      if (this.updateKey !== updateKey) {
        return
      }
      gdService.updateCharacteristic(this.hapChar.CurrentDoorState, value)
      this.accessory.context.cacheStates[garageChannel].cacheCurrentDoorState = value
      if (!this.disableDeviceLogging) {
        this.log(
          '[%s] current state [garage %s %s].',
          this.name, garageChannel,
          value === 0 ? 'open' : 'closed'
        )
      }
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
