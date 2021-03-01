/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceBlind {
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
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Set up the accessory with default positions when added the first time
    if (!this.funcs.hasProperty(this.accessory.context, 'cacheCurrentPosition')) {
      this.accessory.context.cacheCurrentPosition = 0
      this.accessory.context.cachePositionState = 2
      this.accessory.context.cacheTargetPosition = 0
    }

    // Add the window covering service if it doesn't already exist
    if (!(this.service = this.accessory.getService(this.hapServ.WindowCovering))) {
      this.service = this.accessory.addService(this.hapServ.WindowCovering)
      this.service.setCharacteristic(this.hapChar.CurrentPosition, 0)
        .setCharacteristic(this.hapChar.TargetPosition, 0)
        .setCharacteristic(this.hapChar.PositionState, 2)
    }

    // Add the set handler to the target position characteristic
    this.service.getCharacteristic(this.hapChar.TargetPosition)
      .on('set', this.internalUpdate.bind(this))

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
    
    // Reset for beta
    this.accessory.context.cacheCurrentPosition = 0
    this.accessory.context.cachePositionState = 2
    this.accessory.context.cacheTargetPosition = 0
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      let prevPosition = this.accessory.context.cacheCurrentPosition
      if (value === prevPosition) {
        return
      }
      const params = { switches: this.consts.defaultMultiSwitchOff }
      const prevState = this.accessory.context.cachePositionState
      const percentStepUpPerDS = this.operationTimeUp / 100
      const percentStepDownPerDS = this.operationTimeDown / 100
      const updateKey = Math.random().toString(36).substr(2, 8)
      this.updateKey = updateKey
      if (prevState !== 2) {
        await this.platform.sendDeviceUpdate(this.accessory, params)
        const posPercentChange = Math.floor(Date.now() / 100) -
          this.accessory.context.cacheLastStartTime
        const posPercentChangeUp = Math.floor(percentStepUpPerDS * posPercentChange)
        const posPercentChangeDown = Math.floor(percentStepDownPerDS * posPercentChange)
        if (prevState === 0) {
          // Was going down
          prevPosition -= posPercentChangeDown
        } else {
          // Was going up
          prevPosition += posPercentChangeUp
        }
        this.service.updateCharacteristic(this.hapChar.CurrentPosition, prevPosition)
        this.accessory.context.cacheCurrentPosition = prevPosition
      }
      const diffPosition = value - prevPosition
      const setToMoveUp = diffPosition > 0
      let decisecondsToMove
      if (setToMoveUp) {
        decisecondsToMove = Math.round(Math.abs(diffPosition) * percentStepUpPerDS)
        params.switches[0].switch = 'on'
        params.switches[1].switch = 'off'
      } else {
        decisecondsToMove = Math.round(Math.abs(diffPosition) * percentStepDownPerDS)
        params.switches[0].switch = 'off'
        params.switches[1].switch = 'on'
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.accessory.context.cacheTargetPosition = value
      this.accessory.context.cachePositionState = setToMoveUp ? 1 : 0
      this.accessory.context.cacheLastStartTime = Math.floor(Date.now() / 100)
      await this.funcs.sleep(decisecondsToMove * 100)
      if (this.updateKey !== updateKey) {
        return
      }
      params.switches[0].switch = 'off'
      params.switches[1].switch = 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.service.updateCharacteristic(this.hapChar.PositionState, 2)
        .updateCharacteristic(this.hapChar.CurrentPosition, value)
      this.accessory.context.cachePositionState = 2
      this.accessory.context.cacheCurrentPosition = value
      if (!this.disableDeviceLogging) {
        this.log('[%s] current position [%s%]', this.name, value)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {

  }
}
