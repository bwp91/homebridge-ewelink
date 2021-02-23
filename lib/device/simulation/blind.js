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
      const opts = JSON.stringify({ disableDeviceLogging: this.disableDeviceLogging })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      const blindConfig = this.platform.simulations[this.accessory.context.eweDeviceId]
      let prevPosition = this.accessory.context.cacheCurrentPosition
      if (value === prevPosition) {
        return
      }
      const params = { switches: this.consts.defaultMultiSwitchOff }
      const prevState = this.accessory.context.cachePositionState
      const percentStepPerDS = blindConfig.operationTime / 100
      const updateKey = Math.random().toString(36).substr(2, 8)
      this.updateKey = updateKey
      if (prevState !== 2) {
        await this.platform.sendDeviceUpdate(this.accessory, params)
        let posPercentChange = Math.floor(Date.now() / 100) -
          this.accessory.context.cacheLastStartTime
        posPercentChange = Math.floor(percentStepPerDS * posPercentChange)
        if (prevState === 0) {
          prevPosition -= posPercentChange
        } else {
          prevPosition += posPercentChange
        }
        this.service.updateCharacteristic(this.hapChar.CurrentPosition, prevPosition)
        this.accessory.context.cacheCurrentPosition = prevPosition
      }
      const diffPosition = value - prevPosition
      const setToMoveUp = diffPosition > 0
      const decisecondsToMove = Math.round(Math.abs(diffPosition) * percentStepPerDS)
      params.switches[0].switch = setToMoveUp ? 'on' : 'off'
      params.switches[1].switch = setToMoveUp ? 'off' : 'on'
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
