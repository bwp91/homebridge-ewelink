'use strict'
let Characteristic, Service
const cns = require('./../constants')
const utils = require('./../utils')
module.exports = class deviceBlind {
  constructor (platform) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
  }

  async internalBlindUpdate (accessory, value, callback) {
    callback()
    try {
      let blindConfig
      const params = {}
      const wcService = accessory.getService(Service.WindowCovering)
      const prevState = accessory.context.cachePositionState
      let prevPosition = accessory.context.cacheCurrentPosition
      const newTarget = value
      const updateKey = Math.random().toString(36).substr(2, 8)
      if (!(blindConfig = this.platform.cusG.get(accessory.context.hbDeviceId))) {
        throw new Error('group config missing')
      }
      if (blindConfig.type !== 'blind' || blindConfig.setup !== 'twoSwitch') {
        throw new Error('improper configuration')
      }
      if (newTarget === prevPosition) return
      params.switches = cns.defaultMultiSwitchOff
      accessory.context.updateKey = updateKey
      const percentStepPerDecisecond = blindConfig.operationTime / 100
      //
      //
      this.platform.log('============================')
      this.platform.log('============================')
      this.platform.log('Starting main calculation...')
      //
      //
      if (prevState !== 2) {
        await this.platform.sendDeviceUpdate(accessory, params)
        let positionPercentChange = Math.floor(Date.now() / 100) - accessory.context.cacheLastStartTime
        positionPercentChange = Math.floor(percentStepPerDecisecond * positionPercentChange)
        if (prevState === 0) {
          // moving down
          prevPosition -= positionPercentChange
        } else {
          prevPosition += positionPercentChange
        }
        wcService.updateCharacteristic(Characteristic.CurrentPosition, prevPosition)
        accessory.context.cacheCurrentPosition = prevPosition
        this.platform.log.warn('Moving from [%s%] to [%s%]', prevPosition, newTarget)
        this.platform.log.warn(
          'Blind was already moving %s when it was changed and was probably around %s%',
          prevState === 1 ? 'up' : 'down',
          prevPosition
        )
        this.platform.log.warn(
          'Giving a difference of %s seconds -  a position change of %s%',
          (Math.floor(Date.now() / 100) - accessory.context.cacheLastStartTime) / 10,
          positionPercentChange
        )
      } else {
        this.platform.log('Moving from [%s%] to [%s%].', prevPosition, newTarget)
      }
      const diffPosition = newTarget - prevPosition
      const setToMoveUp = diffPosition > 0
      const decisecondsToMove = Math.round(Math.abs(diffPosition) * percentStepPerDecisecond)
      this.platform.log(
        'So we need to move %s from the previous state of %s for about %s seconds',
        setToMoveUp ? 'up' : 'down',
        prevState === 0 ? 'moving down' : prevState === 1 ? 'moving up' : 'stopped',
        decisecondsToMove / 10
      )
      params.switches[0].switch = setToMoveUp ? 'on' : 'off'
      params.switches[1].switch = setToMoveUp ? 'off' : 'on'
      await this.platform.sendDeviceUpdate(accessory, params)
      wcService
        .updateCharacteristic(Characteristic.TargetPosition, newTarget)
        .updateCharacteristic(Characteristic.PositionState, setToMoveUp)
      accessory.context.cacheTargetPosition = newTarget
      accessory.context.cachePositionState = setToMoveUp ? 1 : 0
      accessory.context.cacheLastStartTime = Math.floor(Date.now() / 100)
      if (accessory.context.updateKey !== updateKey) return
      await utils.sleep(decisecondsToMove * 100)
      if (accessory.context.updateKey !== updateKey) return
      params.switches[0].switch = 'off'
      params.switches[1].switch = 'off'
      await this.platform.sendDeviceUpdate(accessory, params)
      wcService.updateCharacteristic(Characteristic.PositionState, 2)
      wcService.updateCharacteristic(Characteristic.CurrentPosition, newTarget)
      accessory.context.cachePositionState = 2
      accessory.context.cacheCurrentPosition = newTarget
    } catch (err) {
      this.platform.requestDeviceRefresh(accessory, err)
    }
  }
}
