/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const helpers = require('./../helpers')
module.exports = class deviceFan {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    const fanService = accessory.getService(this.Service.Fan) || accessory.addService(this.Service.Fan)
    const fanLightService = accessory.getService(this.Service.Lightbulb) || accessory.addService(this.Service.Lightbulb)
    fanService
      .getCharacteristic(this.Characteristic.On)
      .on('set', async (value, callback) => {
        callback()
        if (value === 0) {
          await helpers.sleep(500)
          fanService.setCharacteristic(this.Characteristic.RotationSpeed, 0)
        }
      })
    fanService
      .getCharacteristic(this.Characteristic.RotationSpeed)
      .on('set', (value, callback) => this.internalUpdate('speed', value, callback))
      .setProps({
        minStep: 33
      })
    fanLightService
      .getCharacteristic(this.Characteristic.On)
      .on('set', (value, callback) => this.internalUpdate('light', value, callback))
    this.accessory = accessory
  }

  async internalUpdate (type, value, callback) {
    callback()
    try {
      let newPower
      let newSpeed
      let newLight
      const lightService = this.accessory.getService(this.Service.Lightbulb)
      const fanService = this.accessory.getService(this.Service.Fanv2)
      const params = { switches: helpers.defaultMultiSwitchOff }
      switch (type) {
        case 'speed':
          newPower = value >= 33 ? 1 : 0
          newSpeed = value
          newLight = lightService.getCharacteristic(this.Characteristic.On).value
          break
        case 'light':
          newPower = fanService.getCharacteristic(this.Characteristic.Active).value
          newSpeed = fanService.getCharacteristic(this.Characteristic.RotationSpeed).value
          newLight = value
          break
      }
      params.switches[0].switch = newLight ? 'on' : 'off'
      params.switches[1].switch = newPower === 1 && newSpeed >= 33 ? 'on' : 'off'
      params.switches[2].switch = newPower === 1 && newSpeed >= 66 && newSpeed < 99 ? 'on' : 'off'
      params.switches[3].switch = newPower === 1 && newSpeed >= 99 ? 'on' : 'off'

      lightService.updateCharacteristic(this.Characteristic.On, newLight)
      fanService
        .updateCharacteristic(this.Characteristic.Active, newPower)
        .updateCharacteristic(this.Characteristic.RotationSpeed, newSpeed)
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (params.switches && Array.isArray(params.switches)) {
        const lightService = this.accessory.getService(this.Service.Lightbulb)
        const fanService = this.accessory.getService(this.Service.Fanv2)
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
        lightService.updateCharacteristic(this.Characteristic.On, light)
        fanService
          .updateCharacteristic(this.Characteristic.Active, status)
          .updateCharacteristic(this.Characteristic.RotationSpeed, speed)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
