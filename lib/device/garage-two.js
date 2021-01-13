/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceGarageTwo {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.operationTime = parseInt(platform.cusG.get(accessory.context.eweDeviceId).operationTime)
    this.operationTime = isNaN(this.operationTime)
      ? this.helpers.defaults.operationTime
      : this.operationTime < 20
        ? this.helpers.defaults.operationTime
        : this.operationTime
    ;['1', '2'].forEach(v => {
      let gdService
      if (!(gdService = accessory.getService('Garage ' + v))) {
        accessory.addService(this.Service.GarageDoorOpener, 'Garage ' + v, 'garage' + v)
          .setCharacteristic(this.Characteristic.CurrentDoorState, 1)
          .setCharacteristic(this.Characteristic.TargetDoorState, 1)
          .setCharacteristic(this.Characteristic.ObstructionDetected, false)
        gdService = accessory.getService('Garage ' + v)
      }
      gdService.getCharacteristic(this.Characteristic.TargetDoorState)
        .on('set', (value, callback) => this.internalUpdate('Garage' + v, value, callback))
    })
    this.accessory = accessory
  }

  async internalUpdate (garage, value, callback) {
    try {
      callback()
      const newPos = value
      const params = { switches: this.cacheSwitchState }
      const gdService = this.accessory.getService(garage)
      const prevState = garage === 'Garage 1'
        ? this.accessory.context.cacheOneCurrentDoorState
        : this.accessory.context.cacheTwoCurrentDoorState
      if (newPos === prevState % 2) return
      this.inUse = true
      gdService.updateCharacteristic(this.Characteristic.TargetDoorState, newPos)
        .updateCharacteristic(this.Characteristic.CurrentDoorState, newPos + 2)
      switch (garage) {
        case 'Garage 1': {
          this.accessory.context.cacheOneTargetDoorState = newPos
          this.accessory.context.cacheOneCurrentDoorState = newPos + 2
          params.switches[0].switch = newPos === 0 ? 'on' : 'off'
          params.switches[1].switch = newPos === 1 ? 'on' : 'off'
          break
        }
        case 'Garage 2': {
          this.accessory.context.cacheTwoTargetDoorState = newPos
          this.accessory.context.cacheTwoCurrentDoorState = newPos + 2
          params.switches[2].switch = newPos === 0 ? 'on' : 'off'
          params.switches[3].switch = newPos === 1 ? 'on' : 'off'
          break
        }
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      await this.helpers.sleep(2000)
      this.inUse = false
      await this.helpers.sleep(Math.max((this.operationTime - 20) * 100, 0))
      gdService.updateCharacteristic(this.Characteristic.CurrentDoorState, newPos)
      switch (garage) {
        case 'Garage 1': {
          this.accessory.context.cacheOneCurrentDoorState = newPos
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [garage 1 %s].', this.accessory.displayName, newPos === 0 ? 'open' : 'closed')
          }
          break
        }
        case 'Garage 2': {
          this.accessory.context.cacheTwoCurrentDoorState = newPos
          if (!this.disableDeviceLogging) {
            this.log('[%s] current state [garage 2 %s].', this.accessory.displayName, newPos === 0 ? 'open' : 'closed')
          }
          break
        }
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  externalUpdate (params) {
    try {
      if (!params.switches) return
      if (this.inUse) return
      this.cacheSwitchState = params.switches
      ;['1', '2'].forEach(async v => {
        const gcService = this.accessory.getService('Garage ' + v)
        const prevState = v === '1'
          ? this.accessory.context.cacheOneCurrentDoorState
          : this.accessory.context.cacheTwoCurrentDoorState
        const newPos = [0, 2].includes(prevState) ? 3 : 2
        switch (v) {
          case '1':
            if (
              params.switches[0].switch === params.switches[1].switch ||
              params.switches[prevState % 2].switch === 'on'
            ) {
              return
            }
            break
          case '2':
            if (
              params.switches[2].switch === params.switches[3].switch ||
              params.switches[(prevState % 2) + 2].switch === 'on'
            ) {
              return
            }
            break
        }
        this.inUse = true
        gcService.updateCharacteristic(this.Characteristic.TargetDoorState, newPos - 2)
          .updateCharacteristic(this.Characteristic.CurrentDoorState, newPos)
        switch (v) {
          case '1':
            this.accessory.context.cacheOneCurrentDoorState = newPos
            this.accessory.context.cacheTwoTargetDoorState = newPos - 2
            break
          case '2':
            this.accessory.context.cacheTwoCurrentDoorState = newPos
            this.accessory.context.cacheTwoTargetDoorState = newPos - 2
            break
        }
        await this.helpers.sleep(2000)
        this.inUse = false
        await this.helpers.sleep(Math.max((this.operationTime - 20) * 100, 0))
        gcService.updateCharacteristic(this.Characteristic.CurrentDoorState, newPos - 2)
        switch (v) {
          case '1':
            this.accessory.context.cacheOneCurrentDoorState = newPos - 2
            if (params.updateSource && !this.disableDeviceLogging) {
              this.log('[%s] current state [garage 1 %s].', this.accessory.displayName, newPos === 2 ? 'open' : 'closed')
            }
            break
          case '2':
            this.accessory.context.cacheTwoCurrentDoorState = newPos - 2
            if (params.updateSource && !this.disableDeviceLogging) {
              this.log('[%s] current state [garage 2 %s].', this.accessory.displayName, newPos === 2 ? 'open' : 'closed')
            }
            break
        }
      })
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
