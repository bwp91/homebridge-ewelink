/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceBlind {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    if (!(this.service = accessory.getService(this.S.WindowCovering))) {
      this.service = accessory.addService(this.S.WindowCovering)
      this.service.setCharacteristic(this.C.CurrentPosition, 0)
        .setCharacteristic(this.C.TargetPosition, 0)
        .setCharacteristic(this.C.PositionState, 2)
    }
    this.service.getCharacteristic(this.C.TargetPosition)
      .on('set', this.internalUpdate.bind(this))
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      const blindConfig = this.platform.cusG.get(this.accessory.context.eweDeviceId)
      let prevPosition = this.accessory.context.cacheCurrentPosition
      if (value === prevPosition) {
        return
      }
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      const prevState = this.accessory.context.cachePositionState
      const percentStepPerDecisecond = blindConfig.operationTime / 100
      const updateKey = Math.random().toString(36).substr(2, 8)
      this.updateKey = updateKey
      if (prevState !== 2) {
        await this.platform.sendDeviceUpdate(this.accessory, params)
        let positionPercentChange = Math.floor(Date.now() / 100) - this.accessory.context.cacheLastStartTime
        positionPercentChange = Math.floor(percentStepPerDecisecond * positionPercentChange)
        if (prevState === 0) {
          prevPosition -= positionPercentChange
        } else {
          prevPosition += positionPercentChange
        }
        this.service.updateCharacteristic(this.C.CurrentPosition, prevPosition)
        this.accessory.context.cacheCurrentPosition = prevPosition
      }
      const diffPosition = value - prevPosition
      const setToMoveUp = diffPosition > 0
      const decisecondsToMove = Math.round(Math.abs(diffPosition) * percentStepPerDecisecond)
      params.switches[0].switch = setToMoveUp ? 'on' : 'off'
      params.switches[1].switch = setToMoveUp ? 'off' : 'on'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.accessory.context.cacheTargetPosition = value
      this.accessory.context.cachePositionState = setToMoveUp ? 1 : 0
      this.accessory.context.cacheLastStartTime = Math.floor(Date.now() / 100)
      await this.helpers.sleep(decisecondsToMove * 100)
      if (this.updateKey !== updateKey) {
        return
      }
      params.switches[0].switch = 'off'
      params.switches[1].switch = 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.service.updateCharacteristic(this.C.PositionState, 2)
        .updateCharacteristic(this.C.CurrentPosition, value)
      this.accessory.context.cachePositionState = 2
      this.accessory.context.cacheCurrentPosition = value
      if (!this.disableDeviceLogging) {
        this.log('[%s] current position [%s%]', this.accessory.displayName, value)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {

  }
}
