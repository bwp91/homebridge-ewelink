/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceGarageFour {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.funcs = platform.funcs
    this.hapChar = platform.api.hap.Characteristic
    this.hapErr = platform.api.hap.HapStatusError
    this.hapServ = platform.api.hap.Service
    this.lang = platform.lang
    this.log = platform.log
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceConf = platform.simulations[accessory.context.eweDeviceId]
    this.operationTimeUp = deviceConf.operationTime || platform.consts.defaultValues.operationTime
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
        gdService.setCharacteristic(this.hapChar.TargetDoorState, 1)
        gdService.setCharacteristic(this.hapChar.ObstructionDetected, false)
      }

      // Add the set handler to the target position characteristic
      gdService.getCharacteristic(this.hapChar.TargetDoorState).onSet(value => {
        // We don't use await as we want the callback to be run straight away
        this.internalStateUpdate(v, value)
      })
    })

    // Output the customised options to the log if in debug mode
    if (platform.config.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        operationTimeDown: this.operationTimeDown,
        operationTimeUp: this.operationTimeUp,
        type: deviceConf.type
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async internalStateUpdate (garage, value) {
    try {
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
      if (value === prevState % 2) {
        return
      }
      const gdService = this.accessory.getService('Garage ' + garage)
      this.inUse = true
      const updateKey = Math.random()
        .toString(36)
        .substr(2, 8)
      this.updateKey = updateKey
      gdService.updateCharacteristic(this.hapChar.TargetDoorState, value)
      gdService.updateCharacteristic(this.hapChar.CurrentDoorState, value + 2)
      this.accessory.context.cacheStates[garageChannel].cacheTargetDoorState = value
      this.accessory.context.cacheStates[garageChannel].cacheCurrentDoorState = value + 2
      const params = {
        switches: [
          {
            switch: 'on',
            outlet: garageChannel
          }
        ]
      }
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
          '[%s] %s [garage %s %s].',
          this.name,
          this.lang.curState,
          garageChannel,
          value === 0 ? this.lang.doorOpen : this.lang.doorClosed
        )
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
      const gdService = this.accessory.getService('Garage ' + garage)
      setTimeout(() => {
        gdService.updateCharacteristic(
          this.hapChar.TargetPosition,
          this.accessory.context.cacheTargetPosition
        )
      }, 2000)
      gdService.updateCharacteristic(this.hapChar.TargetPosition, new this.hapErr(-70402))
    }
  }

  async externalUpdate (params) {}
}
