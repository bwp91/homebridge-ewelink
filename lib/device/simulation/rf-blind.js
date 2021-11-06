/* jshint node: true,esversion: 9, -W014, -W033 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceRFBlind {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.eveChar = platform.eveChar
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

    // Initially set the online flag as true (to be then updated as false if necessary)
    this.isOnline = true

    // Set up custom variables for this device type
    const deviceConf = platform.rfSubdevices[accessory.context.hbDeviceId] || {}
    this.operationTimeUp = deviceConf.operationTime || platform.consts.defaultValues.operationTime
    this.operationTimeDown = deviceConf.operationTimeDown || this.operationTimeUp
    ;[this.chOpen, this.chStop, this.chClose] = Object.keys(this.accessory.context.buttons)

    // Set the correct logging variables for this accessory
    this.enableLogging = !platform.config.disableDeviceLogging
    this.enableDebugLogging = platform.config.debug
    switch (deviceConf.overrideLogging) {
      case 'standard':
        this.enableLogging = true
        this.enableDebugLogging = false
        break
      case 'debug':
        this.enableLogging = true
        this.enableDebugLogging = true
        break
      case 'disable':
        this.enableLogging = false
        this.enableDebugLogging = false
        break
    }

    // temp override
    this.enableLogging = true
    this.enableDebugLogging = true

    // If the accessory has a door service (from an old simulation) then remove it
    if (this.accessory.getService(this.hapServ.Door)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Door))
    }

    // If the accessory has a window service (from an old simulation) then remove it
    if (this.accessory.getService(this.hapServ.Window)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Window))
    }

    // Remove old switch services from before the simulation was configured
    this.accessory.services
      .filter(el => el.constructor.name === 'Switch')
      .forEach(el => this.accessory.removeService(el))

    // Set up the accessory with default positions when added the first time
    if (!this.funcs.hasProperty(this.accessory.context, 'cacheCurrentPosition')) {
      this.accessory.context.cacheCurrentPosition = 0
      this.accessory.context.cachePositionState = 2
      this.accessory.context.cacheTargetPosition = 0
    }

    // Add the window covering service if it doesn't already exist
    if (!(this.service = this.accessory.getService(this.hapServ.WindowCovering))) {
      this.service = this.accessory.addService(this.hapServ.WindowCovering)
      this.service.updateCharacteristic(this.hapChar.CurrentPosition, 0)
      this.service.updateCharacteristic(this.hapChar.TargetPosition, 0)
      this.service.updateCharacteristic(this.hapChar.PositionState, 2)
    }

    // Add the set handler to the target position characteristic
    this.service.getCharacteristic(this.hapChar.TargetPosition).onSet(value => {
      // We don't use await as we want the callback to be run straight away
      this.internalPositionUpdate(value)
    })

    // Add the get handlers only if the user hasn't disabled the disableNoResponse setting
    if (!platform.config.disableNoResponse) {
      this.service.getCharacteristic(this.hapChar.CurrentPosition).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.CurrentPosition).value
      })
      this.service.getCharacteristic(this.hapChar.TargetPosition).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.TargetPosition).value
      })
    }

    // Output the customised options to the log
    const opts = JSON.stringify({
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable',
      operationTime: this.operationTimeUp,
      operationTimeDown: this.operationTimeDown
    })
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
  }

  async internalPositionUpdate (value) {
    try {
      let prevPosition = this.accessory.context.cacheCurrentPosition
      if (value === prevPosition) {
        return
      }
      const params = { cmd: 'transmit' }
      const prevState = this.accessory.context.cachePositionState
      const percentStepUpPerDS = this.operationTimeUp / 100
      const percentStepDownPerDS = this.operationTimeDown / 100
      const updateKey = this.funcs.generateRandomString(5)
      this.updateKey = updateKey
      if (prevState !== 2) {
        const posPercentChange =
          Math.floor(Date.now() / 100) - this.accessory.context.cacheLastStartTime
        const posPercentChangeUp = Math.floor(percentStepUpPerDS * posPercentChange)
        const posPercentChangeDown = Math.floor(percentStepDownPerDS * posPercentChange)
        if (prevState === 0) {
          // Was going down
          prevPosition -= posPercentChangeDown
        } else {
          // Was going up
          prevPosition += posPercentChangeUp
        }
        prevPosition = Math.min(Math.max(prevPosition, 0), 100)
        this.service.updateCharacteristic(this.hapChar.CurrentPosition, prevPosition)
        this.accessory.context.cacheCurrentPosition = prevPosition
      }
      const diffPosition = value - prevPosition
      const setToMoveUp = diffPosition > 0
      let decisecondsToMove
      if (setToMoveUp) {
        decisecondsToMove = Math.round(Math.abs(diffPosition) * percentStepUpPerDS)
        params.rfChl = this.chOpen
      } else {
        decisecondsToMove = Math.round(Math.abs(diffPosition) * percentStepDownPerDS)
        params.rfChl = this.chClose
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.accessory.context.cacheTargetPosition = value
      this.accessory.context.cachePositionState = setToMoveUp ? 1 : 0
      this.accessory.context.cacheLastStartTime = Math.floor(Date.now() / 100)
      await this.funcs.sleep(decisecondsToMove * 100)
      if (this.updateKey !== updateKey) {
        return
      }
      params.rfChl = this.chStop
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.service.updateCharacteristic(this.hapChar.PositionState, 2)
      this.service.updateCharacteristic(this.hapChar.CurrentPosition, value)
      this.accessory.context.cachePositionState = 2
      this.accessory.context.cacheCurrentPosition = value
      if (this.enableLogging) {
        this.log('[%s] %s [%s%]', this.name, this.lang.curPos, value)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(
          this.hapChar.TargetPosition,
          this.accessory.context.cacheTargetPosition
        )
      }, 2000)
      this.service.updateCharacteristic(this.hapChar.TargetPosition, new this.hapErr(-70402))
    }
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
