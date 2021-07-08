/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSensorHidden {
  constructor (platform, accessory, devicesInHB) {
    // Set up variables from the platform
    this.devicesInHB = devicesInHB
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.eveChar = platform.eveChar
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
      for (const [deviceId, group] of Object.entries(this.platform.deviceConf)) {
        if (
          group.sensorId === this.accessory.context.eweDeviceId &&
          group.showAs &&
          ['garage', 'lock'].includes(group.showAs)
        ) {
          const uuid = this.hapUUIDGen(deviceId + 'SWX')
          if (this.devicesInHB.has(uuid)) {
            const subAccessory = this.devicesInHB.get(uuid)

            // Set the correct logging variables for this accessory
            let enableLogging = !this.disableDeviceLogging
            if (group.overrideLogging) {
              switch (group.overrideLogging) {
                case 'standard':
                case 'debug':
                  enableLogging = true
                  break
                case 'disable':
                  enableLogging = false
                  break
              }
            }
            const isGarage = group.showAs === 'garage'
            const subService = subAccessory.getService(
              isGarage ? this.hapServ.GarageDoorOpener : this.hapServ.LockMechanism
            )
            const name = subAccessory.displayName
            switch (newState) {
              case 0:
                if (isGarage) {
                  subService.updateCharacteristic(this.hapChar.TargetDoorState, 1)
                  subService.updateCharacteristic(this.hapChar.CurrentDoorState, 1)
                  subAccessory.eveService.addEntry({ status: 1 })
                  if (params.updateSource && enableLogging) {
                    this.log('[%s] %s [%s].', name, this.lang.curState, this.lang.doorClosed)
                  }
                } else {
                  subService.updateCharacteristic(this.hapChar.LockTargetState, 1)
                  subService.updateCharacteristic(this.hapChar.LockCurrentState, 1)
                  if (params.updateSource && enableLogging) {
                    this.log('[%s] %s [%s].', name, this.lang.curState, this.lang.lockLocked)
                  }
                }
                break
              case 1: {
                if (isGarage) {
                  await this.funcs.sleep(Math.max(group.operationTime * 100, 2000))
                  subService.updateCharacteristic(this.hapChar.TargetDoorState, 0)
                  subService.updateCharacteristic(this.hapChar.CurrentDoorState, 0)
                  subAccessory.eveService.addEntry({ status: 0 })
                  const initialTime = subAccessory.eveService.getInitialTime()
                  subService.updateCharacteristic(
                    this.eveChar.LastActivation,
                    Math.round(new Date().valueOf() / 1000) - initialTime
                  )
                  const newTO = subService.getCharacteristic(this.eveChar.TimesOpened).value + 1
                  subService.updateCharacteristic(this.eveChar.TimesOpened, newTO)
                  if (params.updateSource && enableLogging) {
                    this.log('[%s] %s [%s].', name, this.lang.curState, this.lang.doorOpen)
                  }
                } else {
                  subService.updateCharacteristic(this.hapChar.LockTargetState, 0)
                  subService.updateCharacteristic(this.hapChar.LockCurrentState, 0)
                  if (params.updateSource && enableLogging) {
                    this.log('[%s] %s [%s].', name, this.lang.curState, this.lang.lockUnlocked)
                  }
                }
                break
              }
            }
          }
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
