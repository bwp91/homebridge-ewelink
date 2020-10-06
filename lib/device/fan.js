'use strict'
let Characteristic, Service
const cns = require('./../constants')
const utils = require('./../utils')
module.exports = class deviceFan {
  constructor (platform, accessory) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
    const fanService = accessory.getService(Service.Fanv2) || accessory.addService(Service.Fanv2)
    const fanLightService = accessory.getService(Service.Lightbulb) || accessory.addService(Service.Lightbulb)
    fanService
      .getCharacteristic(Characteristic.Active)
      .on('set', (value, callback) => this.internalUpdate(accessory, 'power', value, callback))
    fanService
      .getCharacteristic(Characteristic.RotationSpeed)
      .on('set', (value, callback) => this.internalUpdate(accessory, 'speed', value, callback))
      .setProps({
        minStep: 33
      })
    fanLightService
      .getCharacteristic(Characteristic.On)
      .on('set', (value, callback) => this.internalUpdate(accessory, 'light', value, callback))
  }

  async internalUpdate (accessory, type, value, callback) {
    callback()
    try {
      let newPower
      let newSpeed
      let newLight
      const lightService = accessory.getService(Service.Lightbulb)
      const fanService = accessory.getService(Service.Fanv2)
      const params = { switches: cns.defaultMultiSwitchOff }
      switch (type) {
        case 'power':
          newPower = value
          newSpeed = value ? 33 : 0
          newLight = lightService.getCharacteristic(Characteristic.On).value
          break
        case 'speed':
          newPower = value >= 33 ? 1 : 0
          newSpeed = value
          newLight = lightService.getCharacteristic(Characteristic.On).value
          await utils.sleep(500)
          break
        case 'light':
          newPower = fanService.getCharacteristic(Characteristic.Active).value
          newSpeed = fanService.getCharacteristic(Characteristic.RotationSpeed).value
          newLight = value
          break
      }
      params.switches[0].switch = newLight ? 'on' : 'off'
      params.switches[1].switch = newPower === 1 && newSpeed >= 33 ? 'on' : 'off'
      params.switches[2].switch = newPower === 1 && newSpeed >= 66 && newSpeed < 99 ? 'on' : 'off'
      params.switches[3].switch = newPower === 1 && newSpeed >= 99 ? 'on' : 'off'
      await this.platform.sendDeviceUpdate(accessory, params)
      lightService.updateCharacteristic(Characteristic.On, newLight)
      fanService
        .updateCharacteristic(Characteristic.Active, newPower)
        .updateCharacteristic(Characteristic.RotationSpeed, newSpeed)
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {
      if (params.switches && Array.isArray(params.switches)) {
        const lightService = accessory.getService(Service.Lightbulb)
        const fanService = accessory.getService(Service.Fanv2)
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
        lightService.updateCharacteristic(Characteristic.On, light)
        fanService
          .updateCharacteristic(Characteristic.Active, status)
          .updateCharacteristic(Characteristic.RotationSpeed, speed)
      }
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
