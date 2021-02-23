/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceFan {
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

    // Set up custom variables for this device type
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.fanDevices[deviceId]
    this.hideLight = deviceConf && deviceConf.hideLight
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Add the fan service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.Fan) ||
      this.accessory.addService(this.hapServ.Fan)

    // Add the set handler to the fan on/off characteristic
    this.service.getCharacteristic(this.hapChar.On)
      .on('set', (value, callback) => {
        callback()
        if (!value) {
          this.service.setCharacteristic(this.hapChar.RotationSpeed, 0)
        }
      })

    // Add the set handler to the fan rotation speed characteristic
    this.service.getCharacteristic(this.hapChar.RotationSpeed)
      .on('set', this.internalSpeedUpdate.bind(this))
      .setProps({ minStep: 33 })

    // Check to see if the user has hidden the light channel
    if (this.hideLight) {
      // The user has hidden the light channel, so remove it if it exists
      if (this.accessory.getService(this.hapServ.Lightbulb)) {
        this.accessory.removeService(this.accessory.getService(this.hapServ.Lightbulb))
      }
    } else {
      // The user has not hidden the light channel, so add it if it doesn't exist
      this.lightService = this.accessory.getService(this.hapServ.Lightbulb) ||
        this.accessory.addService(this.hapServ.Lightbulb)

      // Add the set handler to the lightbulb on/off characteristic
      this.lightService.getCharacteristic(this.hapChar.On)
        .on('set', this.internalLightUpdate.bind(this))
    }

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        hideLight: this.hideLight
      })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async internalSpeedUpdate (value, callback) {
    try {
      callback()
      const params = { switches: this.consts.defaultMultiSwitchOff }
      const newPower = value >= 33
      const newSpeed = value
      const newLight = this.lightService
        ? this.lightService.getCharacteristic(this.hapChar.On).value
        : true
      params.switches[0].switch = newLight ? 'on' : 'off'
      params.switches[1].switch = newPower && newSpeed >= 33 ? 'on' : 'off'
      params.switches[2].switch = newPower && newSpeed >= 66 && newSpeed < 99
        ? 'on'
        : 'off'
      params.switches[3].switch = newPower && newSpeed >= 99 ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (newPower !== (this.cacheOnOff === 'on')) {
        this.cacheOnOff = newPower ? 'on' : 'off'
        if (!this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
        }
      }
      if (newSpeed !== this.cacheSpeed) {
        this.cacheSpeed = newSpeed
        if (!this.disableDeviceLogging) {
          this.log('[%s] current speed [%s%].', this.name, this.cacheSpeed)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalLightUpdate (value, callback) {
    try {
      callback()
      const params = { switches: this.consts.defaultMultiSwitchOff }
      const newPower = this.service.getCharacteristic(this.hapChar.On).value
      const newSpeed = this.service.getCharacteristic(this.hapChar.RotationSpeed).value
      const newLight = this.lightService ? value : true
      params.switches[0].switch = newLight ? 'on' : 'off'
      params.switches[1].switch = newPower && newSpeed >= 33 ? 'on' : 'off'
      params.switches[2].switch = newPower && newSpeed >= 66 && newSpeed < 99
        ? 'on'
        : 'off'
      params.switches[3].switch = newPower && newSpeed >= 99 ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (newLight !== (this.cacheLight === 'on')) {
        this.cacheLight = newLight ? 'on' : 'off'
        if (!this.disableDeviceLogging) {
          this.log('[%s] current light [%s].', this.name, this.cacheLight)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switches) {
        return
      }
      if (params.switches[1].switch !== this.cacheOnOff) {
        this.cacheOnOff = params.switches[1].switch
        this.service.updateCharacteristic(this.hapChar.On, this.cacheLight === 'on')
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
        }
      }
      let speed = 0
      switch (params.switches[2].switch + params.switches[3].switch) {
        case 'offoff':
          speed = 33
          break
        case 'onoff':
          speed = 66
          break
        case 'offon':
          speed = 99
      }
      if (speed !== this.cacheSpeed) {
        this.cacheSpeed = speed
        this.service.updateCharacteristic(this.hapChar.RotationSpeed, this.cacheSpeed)
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current speed [%s%].', this.name, this.cacheSpeed)
        }
      }
      if (this.lightService && params.switches[0].switch !== this.cacheLight) {
        this.cacheLight = params.switches[0].switch
        this.lightService.updateCharacteristic(this.hapChar.On, this.cacheLight === 'on')
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current light state [%s].', this.name, this.cacheLight)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
