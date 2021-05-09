/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceFan {
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
    const deviceConf = platform.fanDevices[accessory.context.eweDeviceId]
    this.hideLight = deviceConf && deviceConf.hideLight
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Add the fan service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.Fan) ||
      this.accessory.addService(this.hapServ.Fan)

    // Add the set handler to the fan on/off characteristic
    this.service.getCharacteristic(this.hapChar.On).onSet(async value => {
      await this.internalStateUpdate(value)
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

    // Conversion object eWeLink mode to text label
    this.speed2label = {
      33: 'low',
      66: 'medium',
      99: 'high'
    }

    // Output the customised options to the log if in debug mode
    if (platform.config.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        hideLight: this.hideLight
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async internalStateUpdate (value) {
    if (!value) {
      this.service.updateCharacteristic(this.hapChar.RotationSpeed, 0)
      await this.internalSpeedUpdate(0)
    }
  }

  async internalSpeedUpdate (value) {
    try {
      // This acts like a debounce function when endlessly sliding the slider
      const updateKey = Math.random().toString(36).substr(2, 8)
      this.updateKey = updateKey
      await this.funcs.sleep(500)
      if (updateKey !== this.updateKey) {
        return
      }
      const params = {
        switches: []
      }
      const newState = value >= 1
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
      if (newSpeed === this.cacheSpeed) {
        return
      }
      params.switches.push({
        switch: newState && newSpeed >= 33 ? 'on' : 'off',
        outlet: 1
      })
      params.switches.push({
        switch: newState && newSpeed === 66 ? 'on' : 'off',
        outlet: 2
      })
      params.switches.push({
        switch: newState && newSpeed === 99 ? 'on' : 'off',
        outlet: 3
      })
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (newState !== (this.cacheState === 'on')) {
        this.cacheState = newState ? 'on' : 'off'
        if (!this.disableDeviceLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
        }
      }
      if (newSpeed !== this.cacheSpeed && newSpeed > 0) {
        this.cacheSpeed = newSpeed
        if (!this.disableDeviceLogging) {
          this.log(
            '[%s] %s [%s].',
            this.name,
            this.lang.curSpeed,
            this.speed2label[this.cacheSpeed]
          )
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async internalLightUpdate (value) {
    try {
      const params = {
        switches: []
      }
      const newLight = value ? 'on' : 'off'
      if (newLight === this.cacheLight) {
        return
      }
      params.switches.push({
        switch: newLight,
        outlet: 0
      })
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheLight = newLight
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curLight, this.cacheLight)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.lightService.updateCharacteristic(this.hapChar.On, this.cacheLight === 'on')
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switches) {
        return
      }
      if (params.switches[1].switch !== this.cacheState) {
        this.cacheState = params.switches[1].switch
        this.service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on')
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
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
        if (params.updateSource && !this.disableDeviceLogging && this.cacheSpeed > 0) {
          this.log(
            '[%s] %s [%s].',
            this.name,
            this.lang.curSpeed,
            this.speed2label[this.cacheSpeed]
          )
        }
      }
      if (this.lightService && params.switches[0].switch !== this.cacheLight) {
        this.cacheLight = params.switches[0].switch
        this.lightService.updateCharacteristic(this.hapChar.On, this.cacheLight === 'on')
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curLight, this.cacheLight)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  currentState () {
    const toReturn = {}
    let speedLabel
    const speed = this.service.getCharacteristic(this.hapChar.RotationSpeed).value
    if (speed === 0) {
      speedLabel = 'off'
    } else if (speed <= 33) {
      speedLabel = 'low'
    } else if (speed <= 66) {
      speedLabel = 'medium'
    } else {
      speedLabel = 'high'
    }
    toReturn.services = ['fan']
    toReturn.fan = {
      state: this.service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off',
      speed: speedLabel
    }
    if (!this.hideLight) {
      toReturn.services.push('light')
      toReturn.light = {
        state: this.lightService.getCharacteristic(this.hapChar.On).value ? 'on' : 'off'
      }
    }
    return toReturn
  }
}
