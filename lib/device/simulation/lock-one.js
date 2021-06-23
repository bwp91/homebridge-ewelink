/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceLockOne {
  constructor (platform, accessory) {
    // Set up variables from the platform
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
    const deviceConf = platform.simulations[accessory.context.eweDeviceId]
    this.operationTime = deviceConf.operationTime || platform.consts.defaultValues.operationTime

    // Set the correct logging variables for this accessory
    this.enableLogging = !platform.config.disableDeviceLogging
    this.enableDebugLogging = platform.config.debug
    if (deviceConf && deviceConf.overrideLogging) {
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
    }

    // If the accessory has a switch service then remove it
    if (this.accessory.getService(this.hapServ.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
    }

    // Add the lock service if it doesn't already exist
    this.service =
      this.accessory.getService(this.hapServ.LockMechanism) ||
      this.accessory.addService(this.hapServ.LockMechanism)

    // Add the get handler to the current lock state characteristic
    this.service.getCharacteristic(this.hapChar.LockCurrentState).onGet(() => {
      if (!this.isOnline && platform.config.offlineAsNoResponse) {
        throw new this.hapErr(-70402)
      }
      return this.service.getCharacteristic(this.hapChar.LockCurrentState).value
    })

    // Add the set handler to the lock target state characteristic
    this.service
      .getCharacteristic(this.hapChar.LockTargetState)
      .onGet(() => {
        if (!this.isOnline && platform.config.offlineAsNoResponse) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.LockTargetState).value
      })
      .onSet(value => {
        // We don't use await as we want the callback to be run straight away
        this.internalUpdate(value)
      })

    // Always show the accessory as locked on Homebridge restart
    this.service
      .updateCharacteristic(this.hapChar.LockCurrentState, 1)
      .updateCharacteristic(this.hapChar.LockTargetState, 1)

    // Output the customised options to the log
    const opts = JSON.stringify({
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable',
      operationTime: this.operationTime,
      type: deviceConf.type
    })
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
  }

  async internalUpdate (value) {
    try {
      const params = {}
      switch (this.setup) {
        case 'oneSwitch':
          params.switch = 'on'
          break
        case 'twoSwitch':
          params.switches = [
            {
              switch: 'on',
              outlet: 0
            }
          ]
          break
        default:
          return
      }
      this.inUse = true
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.service.setCharacteristic(this.hapChar.LockCurrentState, 0)
      if (this.enableLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curState, this.lang.lockUnlocked)
      }
      await this.funcs.sleep(Math.max(this.operationTime * 100, 1000))
      this.service.updateCharacteristic(this.hapChar.LockTargetState, 1)
      this.service.setCharacteristic(this.hapChar.LockCurrentState, 1)
      this.inUse = false
      if (this.enableLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curState, this.lang.lockLocked)
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.LockTargetState, 1)
      }, 2000)
      this.service.updateCharacteristic(this.hapChar.LockTargetState, new this.hapErr(-70402))
    }
  }

  async externalUpdate (params) {
    try {
      if (this.inUse) {
        return
      }
      if (params.switches) {
        if (!this.setup) {
          this.setup = 'twoSwitch'
        }
        if (params.switches[0].switch === 'off') {
          return
        }
      } else if (params.switch) {
        if (!this.setup) {
          this.setup = 'oneSwitch'
        }
        if (params.switch === 'off') {
          return
        }
      } else {
        return
      }
      this.inUse = true
      this.service.updateCharacteristic(this.hapChar.LockCurrentState, 0)
      this.service.updateCharacteristic(this.hapChar.LockTargetState, 0)
      if (params.updateSource && this.enableLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curState, this.lang.lockUnlocked)
      }
      await this.funcs.sleep(Math.max(this.operationTime * 100, 1000))
      this.service
        .updateCharacteristic(this.hapChar.LockCurrentState, 1)
        .updateCharacteristic(this.hapChar.LockTargetState, 1)
      this.inUse = false
      if (params.updateSource && this.enableLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curState, this.lang.lockLocked)
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
