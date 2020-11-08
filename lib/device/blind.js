/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const helpers = require('./../helpers')
module.exports = class deviceBlind {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    let wcService
    if (!(wcService = accessory.getService(this.Service.WindowCovering))) {
      accessory
        .addService(this.Service.WindowCovering)
        .setCharacteristic(this.Characteristic.CurrentPosition, 0)
        .setCharacteristic(this.Characteristic.TargetPosition, 0)
        .setCharacteristic(this.Characteristic.PositionState, 2)
      wcService = accessory.getService(this.Service.WindowCovering)
    }
    wcService
      .getCharacteristic(this.Characteristic.TargetPosition)
      .on('set', (value, callback) => this.internalUpdate(accessory, value, callback))
  }

  async internalUpdate (accessory, value, callback) {
    try {
      callback()
      let blindConfig
      const params = {}
      const wcService = accessory.getService(this.Service.WindowCovering)
      const prevState = accessory.context.cachePositionState
      let prevPosition = accessory.context.cacheCurrentPosition
      const newTarget = value
      const updateKey = Math.random().toString(36).substr(2, 8)
      if (!(blindConfig = this.platform.cusG.get(accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (blindConfig.type !== 'blind') {
        throw new Error('improper configuration')
      }
      if (newTarget === prevPosition) return
      params.switches = helpers.defaultMultiSwitchOff
      accessory.context.updateKey = updateKey
      const percentStepPerDecisecond = blindConfig.operationTime / 100
      if (prevState !== 2) {
        await this.platform.sendDeviceUpdate(accessory, params)
        let positionPercentChange = Math.floor(Date.now() / 100) - accessory.context.cacheLastStartTime
        positionPercentChange = Math.floor(percentStepPerDecisecond * positionPercentChange)
        if (prevState === 0) {
          prevPosition -= positionPercentChange
        } else {
          prevPosition += positionPercentChange
        }
        wcService.updateCharacteristic(this.Characteristic.CurrentPosition, prevPosition)
        accessory.context.cacheCurrentPosition = prevPosition
      }
      const diffPosition = newTarget - prevPosition
      const setToMoveUp = diffPosition > 0
      const decisecondsToMove = Math.round(Math.abs(diffPosition) * percentStepPerDecisecond)
      params.switches[0].switch = setToMoveUp ? 'on' : 'off'
      params.switches[1].switch = setToMoveUp ? 'off' : 'on'
      await this.platform.sendDeviceUpdate(accessory, params)
      accessory.context.cacheTargetPosition = newTarget
      accessory.context.cachePositionState = setToMoveUp ? 1 : 0
      accessory.context.cacheLastStartTime = Math.floor(Date.now() / 100)
      if (accessory.context.updateKey !== updateKey) return
      await helpers.sleep(decisecondsToMove * 100)
      if (accessory.context.updateKey !== updateKey) return
      params.switches[0].switch = 'off'
      params.switches[1].switch = 'off'
      await this.platform.sendDeviceUpdate(accessory, params)
      wcService.updateCharacteristic(this.Characteristic.PositionState, 2)
      wcService.updateCharacteristic(this.Characteristic.CurrentPosition, newTarget)
      accessory.context.cachePositionState = 2
      accessory.context.cacheCurrentPosition = newTarget
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {

  }
}
