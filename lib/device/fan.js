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
    this.service.getCharacteristic(this.hapChar.On).onSet(async value => {
      if (!value) {
        this.service.updateCharacteristic(this.hapChar.RotationSpeed, 0)
        await this.internalSpeedUpdate(0)
      }
    })

    // Add the set handler to the fan rotation speed characteristic
    this.service.getCharacteristic(this.hapChar.RotationSpeed).setProps({ minStep: 33 })
      .onSet(async value => {
        await this.internalSpeedUpdate(value)
      })

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
      this.lightService.getCharacteristic(this.hapChar.On).onSet(async value => {
        await this.internalLightUpdate(value)
      })
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

  async internalSpeedUpdate (value) {
    try {
      const params = {
        switches: []
      }
      const newPower = value >= 1
      let newSpeed
      if (value === 0) {
        newSpeed = 0
      } else if (value <= 33) {
        newSpeed = 33
      } else if (value <= 66) {
        newSpeed = 66
      } else {
        newSpeed = 99
      }
      params.switches.push({
        switch: newPower && newSpeed >= 33 ? 'on' : 'off',
        outlet: 1
      })
      params.switches.push({
        switch: newPower && newSpeed === 66 ? 'on' : 'off',
        outlet: 2
      })
      params.switches.push({
        switch: newPower && newSpeed === 99 ? 'on' : 'off',
        outlet: 3
      })
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
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, this.cacheOnOff === 'on')
      }, 5000)
      throw new this.platform.api.hap.HapStatusError(-70402)
    }
  }

  async internalLightUpdate (value) {
    try {
      const params = {
        switches: []
      }
      const newLight = value
      params.switches.push({
        switch: newLight ? 'on' : 'off',
        outlet: 0
      })
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (newLight !== (this.cacheLight === 'on')) {
        this.cacheLight = newLight ? 'on' : 'off'
        if (!this.disableDeviceLogging) {
          this.log('[%s] current light [%s].', this.name, this.cacheLight)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.lightService.updateCharacteristic(this.hapChar.On, this.cacheLight === 'on')
      }, 5000)
      throw new this.platform.api.hap.HapStatusError(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switches) {
        return
      }
      if (params.switches[1].switch !== this.cacheOnOff) {
        this.cacheOnOff = params.switches[1].switch
        this.service.updateCharacteristic(this.hapChar.On, this.cacheOnOff === 'on')
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
