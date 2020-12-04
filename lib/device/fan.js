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
    this.fanService = accessory.getService(this.Service.Fan) || accessory.addService(this.Service.Fan)
    this.fanService
      .getCharacteristic(this.Characteristic.On)
      .on('set', (value, callback) => {
        callback()
        if (!value) this.fanService.setCharacteristic(this.Characteristic.RotationSpeed, 0)
      })
    this.fanService
      .getCharacteristic(this.Characteristic.RotationSpeed)
      .on('set', this.internalSpeedUpdate.bind(this))
      .setProps({
        minStep: 33
      })
    if ((this.platform.config.hideLightFromFan || '').split(',').includes(accessory.context.eweDeviceId)) {
      if (accessory.getService(this.Service.Lightbulb)) {
        accessory.removeService(accessory.getService(this.Service.Lightbulb))
      }
      this.visibleLight = false
    } else {
      this.lightService = accessory.getService(this.Service.Lightbulb) || accessory.addService(this.Service.Lightbulb)
      this.lightService
        .getCharacteristic(this.Characteristic.On)
        .on('set', this.internalLightUpdate.bind(this))
      this.visibleLight = true
    }
    this.accessory = accessory
  }

  async internalSpeedUpdate (value, callback) {
    try {
      callback()
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      const newPower = value >= 33 ? 1 : 0
      const newSpeed = value
      const newLight = this.visibleLight ? this.lightService.getCharacteristic(this.Characteristic.On).value : true
      params.switches[0].switch = newLight ? 'on' : 'off'
      params.switches[1].switch = newPower === 1 && newSpeed >= 33 ? 'on' : 'off'
      params.switches[2].switch = newPower === 1 && newSpeed >= 66 && newSpeed < 99 ? 'on' : 'off'
      params.switches[3].switch = newPower === 1 && newSpeed >= 99 ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async internalLightUpdate (value, callback) {
    try {
      callback()
      const params = { switches: this.helpers.defaultMultiSwitchOff }
      const newPower = this.fanService.getCharacteristic(this.Characteristic.On).value
      const newSpeed = this.fanService.getCharacteristic(this.Characteristic.RotationSpeed).value
      const newLight = this.visibleLight ? value : true
      params.switches[0].switch = newLight ? 'on' : 'off'
      params.switches[1].switch = newPower === 1 && newSpeed >= 33 ? 'on' : 'off'
      params.switches[2].switch = newPower === 1 && newSpeed >= 66 && newSpeed < 99 ? 'on' : 'off'
      params.switches[3].switch = newPower === 1 && newSpeed >= 99 ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.helpers.hasProperty(params, 'updateSource') && params.updateSource === 'LAN') return
      if (params.switches && Array.isArray(params.switches)) {
        const light = params.switches[0].switch === 'on'
        let status
        let speed
        switch (params.switches[1].switch + params.switches[2].switch + params.switches[3].switch) {
          default:
            status = 0
            speed = 0
            break
          case 'onoffoff':
            status = 1
            speed = 33
            break
          case 'ononoff':
            status = 1
            speed = 66
            break
          case 'onoffon':
            status = 1
            speed = 99
        }
        if (this.visibleLight) this.lightService.updateCharacteristic(this.Characteristic.On, light)
        this.fanService
          .updateCharacteristic(this.Characteristic.On, status)
          .updateCharacteristic(this.Characteristic.RotationSpeed, speed)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
