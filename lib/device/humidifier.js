/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceHumidifier {
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

    /*
      The device does not provide a current humidity reading so
      we use a fan accessory to be able to control the on/off state
      and the modes (1, 2, 3) using a rotation speed of (33%, 66%, 99%)
    */

    // Add the fan service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.Fan) ||
      this.accessory.addService(this.hapServ.Fan)

    // Add the set handler to the fan on/off characteristic
    this.service.getCharacteristic(this.hapChar.On).onSet(async value => {
      if (!value) {
        await this.internalUpdate(0)
      }
    })

    // Add the set handler to the fan rotation speed characteristic
    this.service.getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({ minStep: 33 })
      .onSet(async value => {
        await this.internalUpdate(value)
      })
  }

  async internalUpdate (value) {
    try {
      const updateKey = Math.random().toString(36).substr(2, 8)
      this.updateKey = updateKey
      await this.funcs.sleep(350)
      if (updateKey !== this.updateKey) {
        return
      }
      const params = {}
      let newState
      if (value === 0) {
        if (this.cacheOnOff === 'off') {
          return
        }
        params.switch = 'off'
      } else {
        if (value > 0 && value <= 33) {
          newState = 1
        } else if (value > 33 && value <= 66) {
          newState = 2
        } else {
          newState = 3
        }
        if (this.cacheState === newState) {
          return
        }
        params.switch = 'on'
        params.state = newState
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (value === 0) {
        this.cacheOnOff = 'off'
      } else {
        this.cacheOnOff = 'on'
        this.cacheState = newState
        if (!this.disableDeviceLogging) {
          this.log('[%s] current mode [%s%].', this.name, this.cacheState)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, this.cacheOnOff === 'on')
      }, 5000)
      throw new this.platform.api.hap.HapStatusError(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (params.switch && params.switch !== this.cacheOnOff) {
        this.cacheOnOff = params.switch
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s%].', this.name, this.cacheOnOff)
        }
        this.service.updateCharacteristic(this.hapChar.On, this.cacheOnOff === 'on')
        if (this.cacheOnOff !== 'on') {
          this.service.updateCharacteristic(this.hapChar.RotationSpeed, 0)
        }
      }
      if (params.state && params.state !== this.cacheState) {
        this.cacheState = params.state
        if (this.cacheOnOff === 'on') {
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current mode [%s%].', this.name, this.cacheState)
          }
          this.service.updateCharacteristic(
            this.hapChar.RotationSpeed,
            this.cacheState * 33
          )
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
