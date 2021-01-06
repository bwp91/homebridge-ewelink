/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceFan {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.service = accessory.getService(this.Service.Fan) || accessory.addService(this.Service.Fan)
    this.service
      .getCharacteristic(this.Characteristic.On)
      .on('set', (value, callback) => {
        callback()
        if (!value) this.service.setCharacteristic(this.Characteristic.RotationSpeed, 0)
      })
    this.service
      .getCharacteristic(this.Characteristic.RotationSpeed)
      .on('set', this.internalSpeedUpdate.bind(this))
      .setProps({
        minStep: 33
      })
    if ((this.platform.config.hideLightFromFan || '').split(',').includes(accessory.context.eweDeviceId)) {
      if (accessory.getService(this.Service.Lightbulb)) {
        accessory.removeService(accessory.getService(this.Service.Lightbulb))
      }
    } else {
      this.lightService = accessory.getService(this.Service.Lightbulb) || accessory.addService(this.Service.Lightbulb)
      this.lightService
        .getCharacteristic(this.Characteristic.On)
        .on('set', this.internalLightUpdate.bind(this))
    }
    this.accessory = accessory
  }

  async internalSpeedUpdate (value, callback) {
    try {
      callback()
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      const newPower = value >= 33
      const newSpeed = value
      const newLight = this.lightService ? this.lightService.getCharacteristic(this.Characteristic.On).value : true
      params.switches[0].switch = newLight ? 'on' : 'off'
      params.switches[1].switch = newPower && newSpeed >= 33 ? 'on' : 'off'
      params.switches[2].switch = newPower && newSpeed >= 66 && newSpeed < 99 ? 'on' : 'off'
      params.switches[3].switch = newPower && newSpeed >= 99 ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (newPower !== (this.cacheOnOff === 'on')) {
        this.cacheOnOff = newPower ? 'on' : 'off'
        this.log('[%s] current state [%s].', this.accessory.displayName, this.cacheOnOff)
      }
      if (newSpeed !== this.cacheSpeed) {
        this.cacheSpeed = newSpeed
        this.log('[%s] current speed [%s%].', this.accessory.displayName, this.cacheSpeed)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalLightUpdate (value, callback) {
    try {
      callback()
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      const newPower = this.service.getCharacteristic(this.Characteristic.On).value
      const newSpeed = this.service.getCharacteristic(this.Characteristic.RotationSpeed).value
      const newLight = this.lightService ? value : true
      params.switches[0].switch = newLight ? 'on' : 'off'
      params.switches[1].switch = newPower && newSpeed >= 33 ? 'on' : 'off'
      params.switches[2].switch = newPower && newSpeed >= 66 && newSpeed < 99 ? 'on' : 'off'
      params.switches[3].switch = newPower && newSpeed >= 99 ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      if (newLight !== (this.cacheLight === 'on')) {
        this.cacheLight = newLight ? 'on' : 'off'
        this.log('[%s] current light [%s].', this.accessory.displayName, this.cacheLight)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switches) return
      if (params.switches[1].switch !== this.cacheOnOff) {
        this.cacheOnOff = params.switches[1].switch
        this.service.updateCharacteristic(this.Characteristic.On, this.cacheLight === 'on')
        if (params.updateSource) this.log('[%s] current state [%s].', this.accessory.displayName, this.cacheOnOff)
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
        this.service.updateCharacteristic(this.Characteristic.RotationSpeed, this.cacheSpeed)
        if (params.updateSource) this.log('[%s] current speed [%s%].', this.accessory.displayName, this.cacheSpeed)
      }
      if (this.lightService && params.switches[0].switch !== this.cacheLight) {
        this.cacheLight = params.switches[0].switch
        this.lightService.updateCharacteristic(this.Characteristic.On, this.cacheLight === 'on')
        if (params.updateSource) this.log('[%s] current light state [%s].', this.accessory.displayName, this.cacheLight)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
