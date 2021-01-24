/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceFan {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    this.dName = accessory.displayName
    this.accessory = accessory

    this.service = this.accessory.getService(this.S.Fan) || this.accessory.addService(this.S.Fan)
    this.service.getCharacteristic(this.C.On)
      .on('set', (value, callback) => {
        callback()
        if (!value) {
          this.service.setCharacteristic(this.C.RotationSpeed, 0)
        }
      })
    this.service.getCharacteristic(this.C.RotationSpeed)
      .on('set', this.internalSpeedUpdate.bind(this))
      .setProps({ minStep: 33 })
    if ((this.platform.config.hideLightFromFan || '').split(',').includes(this.accessory.context.eweDeviceId)) {
      if (this.accessory.getService(this.S.Lightbulb)) {
        this.accessory.removeService(this.accessory.getService(this.S.Lightbulb))
      }
    } else {
      this.lightService = this.accessory.getService(this.S.Lightbulb) || this.accessory.addService(this.S.Lightbulb)
      this.lightService.getCharacteristic(this.C.On)
        .on('set', this.internalLightUpdate.bind(this))
    }
  }

  async internalSpeedUpdate (value, callback) {
    try {
      callback()
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      const newPower = value >= 33
      const newSpeed = value
      const newLight = this.lightService ? this.lightService.getCharacteristic(this.C.On).value : true
      params.switches[0].switch = newLight ? 'on' : 'off'
      params.switches[1].switch = newPower && newSpeed >= 33 ? 'on' : 'off'
      params.switches[2].switch = newPower && newSpeed >= 66 && newSpeed < 99 ? 'on' : 'off'
      params.switches[3].switch = newPower && newSpeed >= 99 ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (newPower !== (this.cacheOnOff === 'on')) {
        this.cacheOnOff = newPower ? 'on' : 'off'
        if (!this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.dName, this.cacheOnOff)
        }
      }
      if (newSpeed !== this.cacheSpeed) {
        this.cacheSpeed = newSpeed
        if (!this.disableDeviceLogging) {
          this.log('[%s] current speed [%s%].', this.dName, this.cacheSpeed)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalLightUpdate (value, callback) {
    try {
      callback()
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      const newPower = this.service.getCharacteristic(this.C.On).value
      const newSpeed = this.service.getCharacteristic(this.C.RotationSpeed).value
      const newLight = this.lightService ? value : true
      params.switches[0].switch = newLight ? 'on' : 'off'
      params.switches[1].switch = newPower && newSpeed >= 33 ? 'on' : 'off'
      params.switches[2].switch = newPower && newSpeed >= 66 && newSpeed < 99 ? 'on' : 'off'
      params.switches[3].switch = newPower && newSpeed >= 99 ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (newLight !== (this.cacheLight === 'on')) {
        this.cacheLight = newLight ? 'on' : 'off'
        if (!this.disableDeviceLogging) {
          this.log('[%s] current light [%s].', this.dName, this.cacheLight)
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
        this.service.updateCharacteristic(this.C.On, this.cacheLight === 'on')
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current state [%s].', this.dName, this.cacheOnOff)
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
        this.service.updateCharacteristic(this.C.RotationSpeed, this.cacheSpeed)
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current speed [%s%].', this.dName, this.cacheSpeed)
        }
      }
      if (this.lightService && params.switches[0].switch !== this.cacheLight) {
        this.cacheLight = params.switches[0].switch
        this.lightService.updateCharacteristic(this.C.On, this.cacheLight === 'on')
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] current light state [%s].', this.dName, this.cacheLight)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
