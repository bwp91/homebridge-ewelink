/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceHumidifier {
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

    // Set up custom variables for this device type
    const deviceConf = platform.singleDevices[accessory.context.eweDeviceId]
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

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
        await this.internalModeUpdate(0)
      }
    })

    // Add the set handler to the fan rotation speed characteristic
    this.service.getCharacteristic(this.hapChar.RotationSpeed)
      .setProps({ minStep: 33 })
      .onSet(async value => {
        await this.internalModeUpdate(value)
      })

    // Conversion object eWeLink mode to text label
    this.mode2label = {
      1: 'low',
      2: 'medium',
      3: 'high'
    }

    // Output the customised options to the log if in debug mode
    if (platform.config.debug) {
      const opts = JSON.stringify({ disableDeviceLogging: this.disableDeviceLogging })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async internalModeUpdate (value) {
    try {
      const updateKey = Math.random().toString(36).substr(2, 8)
      this.updateKey = updateKey
      await this.funcs.sleep(500)
      if (updateKey !== this.updateKey) {
        return
      }
      const params = {}
      let newMode
      if (value === 0) {
        if (this.cacheState === 'off') {
          return
        }
        params.switch = 'off'
      } else {
        if (value <= 33) {
          newMode = 1
        } else if (value <= 66) {
          newMode = 2
        } else {
          newMode = 3
        }
        if (this.cacheMode === newMode) {
          return
        }
        params.switch = 'on'
        params.state = newMode
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (value === 0) {
        this.cacheState = 'off'
        if (!this.disableDeviceLogging) {
          this.log('[%s] %s [off].', this.name, this.lang.curState)
        }
      } else {
        this.cacheState = 'on'
        this.cacheMode = newMode
        if (!this.disableDeviceLogging) {
          this.log(
            '[%s] %s [%s].',
            this.name,
            this.lang.curMode,
            this.mode2label[this.cacheMode]
          )
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheMode * 33)
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (params.switch && params.switch !== this.cacheState) {
        this.cacheState = params.switch
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
        }
        this.service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')
        if (this.cacheState !== 'on') {
          this.service.updateCharacteristic(this.hapChar.RotationSpeed, 0)
        }
      }
      if (params.state && params.state !== this.cacheMode) {
        this.cacheMode = params.state
        if (this.cacheState === 'on') {
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log(
              '[%s] %s [%s].',
              this.name,
              this.lang.curMode,
              this.mode2label[this.cacheMode]
            )
          }
          this.service.updateCharacteristic(
            this.hapChar.RotationSpeed,
            this.cacheMode * 33
          )
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
