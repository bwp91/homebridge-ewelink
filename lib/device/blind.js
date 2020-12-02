/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceBlind {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    if (!(this.wcService = accessory.getService(this.Service.WindowCovering))) {
      this.wcService = accessory.addService(this.Service.WindowCovering)
      this.wcService
        .setCharacteristic(this.Characteristic.CurrentPosition, 0)
        .setCharacteristic(this.Characteristic.TargetPosition, 0)
        .setCharacteristic(this.Characteristic.PositionState, 2)
    }
    this.wcService
      .getCharacteristic(this.Characteristic.TargetPosition)
      .on('set', this.internalUpdate.bind(this))
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      let blindConfig
      const params = {}
      const prevState = this.accessory.context.cachePositionState
      let prevPosition = this.accessory.context.cacheCurrentPosition
      const newTarget = value
      const updateKey = Math.random().toString(36).substr(2, 8)
      if (!(blindConfig = this.platform.cusG.get(this.accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (blindConfig.type !== 'blind') {
        throw new Error('improper configuration')
      }
      if (newTarget === prevPosition) return
      params.switches = this.helpers.defaultMultiSwitchOff
      this.accessory.context.updateKey = updateKey
      const percentStepPerDecisecond = blindConfig.operationTime / 100
      if (prevState !== 2) {
        await this.platform.sendDeviceUpdate(this.accessory, params)
        let positionPercentChange = Math.floor(Date.now() / 100) - this.accessory.context.cacheLastStartTime
        positionPercentChange = Math.floor(percentStepPerDecisecond * positionPercentChange)
        if (prevState === 0) {
          prevPosition -= positionPercentChange
        } else {
          prevPosition += positionPercentChange
        }
        this.wcService.updateCharacteristic(this.Characteristic.CurrentPosition, prevPosition)
        this.accessory.context.cacheCurrentPosition = prevPosition
      }
      const diffPosition = newTarget - prevPosition
      const setToMoveUp = diffPosition > 0
      const decisecondsToMove = Math.round(Math.abs(diffPosition) * percentStepPerDecisecond)
      params.switches[0].switch = setToMoveUp ? 'on' : 'off'
      params.switches[1].switch = setToMoveUp ? 'off' : 'on'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.accessory.context.cacheTargetPosition = newTarget
      this.accessory.context.cachePositionState = setToMoveUp ? 1 : 0
      this.accessory.context.cacheLastStartTime = Math.floor(Date.now() / 100)
      await this.helpers.sleep(decisecondsToMove * 100)
      if (this.accessory.context.updateKey !== updateKey) return
      params.switches[0].switch = 'off'
      params.switches[1].switch = 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.wcService
        .updateCharacteristic(this.Characteristic.PositionState, 2)
        .updateCharacteristic(this.Characteristic.CurrentPosition, newTarget)
      this.accessory.context.cachePositionState = 2
      this.accessory.context.cacheCurrentPosition = newTarget
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {

  }
}
