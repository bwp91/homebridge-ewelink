/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSensorHidden {
  constructor (platform, accessory, devicesInHB) {
    // Set up variables from the platform
    this.devicesInHB = devicesInHB
    this.funcs = platform.funcs
    this.hapChar = platform.api.hap.Characteristic
    this.hapServ = platform.api.hap.Service
    this.hapUUIDGen = platform.api.hap.uuid.generate
    this.lang = platform.lang
    this.log = platform.log
    this.platform = platform

    // Set up variables from the accessory
    this.accessory = accessory
  }

  async externalUpdate (params) {
    try {
      if (!this.funcs.hasProperty(params, 'lock') && !params.switch) {
        return
      }
      let newState
      if (params.switch) {
        newState = params.switch === 'on' ? 1 : 0
      } else {
        newState = params.lock
      }
      if (newState === this.cacheState) {
        return
      }
      this.cacheState = newState
      for (const [deviceId, group] of Object.entries(this.platform.simulations)) {
        if (group.sensorId === this.accessory.context.eweDeviceId && group.type === 'garage') {
          const uuid = this.hapUUIDGen(deviceId + 'SWX')
          if (this.devicesInHB.has(uuid)) {
            const subAccessory = this.devicesInHB.get(uuid)
            const gdService = subAccessory.getService(this.hapServ.GarageDoorOpener)
            const name = subAccessory.displayName
            switch (newState) {
              case 0:
                gdService.updateCharacteristic(this.hapChar.TargetDoorState, 1)
                gdService.updateCharacteristic(this.hapChar.CurrentDoorState, 1)
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log('[%s] %s [%s].', name, this.lang.curState, this.lang.doorClosed)
                }
                break
              case 1:
                await this.funcs.sleep(Math.max(group.operationTime * 100, 2000))
                gdService.updateCharacteristic(this.hapChar.TargetDoorState, 0)
                gdService.updateCharacteristic(this.hapChar.CurrentDoorState, 0)
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log('[%s] %s [%s].', name, this.lang.curState, this.lang.doorOpen)
                }
                break
            }
          }
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
