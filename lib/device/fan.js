'use strict'
let Characteristic, Service
const cns = require('./../constants')
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
    if (!Object.prototype.hasOwnProperty.call(accessory.context, 'cacheRotationSpeed')) {
      accessory.context.cacheRotationSpeed = 33
    }
  }

  async internalUpdate (accessory, type, value, callback) {
    callback()
    try {
      let newPower
      let newSpeed
      let newLight
      const lightService = accessory.getService(Service.Lightbulb)
      const fanService = accessory.getService(Service.Fanv2)
      const params = {}
      if (type === 'speed') {
        if (value > 0 && value <= 33) value = 33
        else if (value > 33 && value <= 66) value = 66
        else if (value > 66) value = 99
      }
      switch (type) {
        case 'power':
          newPower = value
          newSpeed = value ? accessory.context.cacheRotationSpeed : 0
          newLight = lightService.getCharacteristic(Characteristic.On).value
          if (accessory.context.eweModel === 'iFan03' && accessory.context.reachableLAN) {
            params.fan = newPower === 1 ? 'on' : 'off'
            await this.platform.sendDeviceUpdate(accessory, params)
          }
          break
        case 'speed':
          newPower = value >= 33 ? 1 : 0
          newSpeed = value
          newLight = lightService.getCharacteristic(Characteristic.On).value
          if (accessory.context.eweModel === 'iFan03' && accessory.context.reachableLAN) {
            if (newPower) {
              params.speed = accessory.context.cacheRotationSpeed / 33
            } else {
              params.fan = 'off'
            }
            await this.platform.sendDeviceUpdate(accessory, params)
          }
          break
        case 'light':
          newPower = fanService.getCharacteristic(Characteristic.Active).value
          newSpeed = fanService.getCharacteristic(Characteristic.RotationSpeed).value
          newLight = value
          if (accessory.context.eweModel === 'iFan03' && accessory.context.reachableLAN) {
            params.light = newLight ? 'on' : 'off'
            await this.platform.sendDeviceUpdate(accessory, params)
          }
          break
      }
      if (accessory.context.eweModel === 'iFan03' && accessory.context.reachableLAN) {
        // done
      } else {
        const params = {}
        params.switches = cns.defaultMultiSwitchOff
        params.switches[0].switch = newLight ? 'on' : 'off'
        params.switches[1].switch = newPower === 1 && newSpeed >= 33 ? 'on' : 'off'
        params.switches[2].switch = newPower === 1 && newSpeed >= 66 && newSpeed < 99 ? 'on' : 'off'
        params.switches[3].switch = newPower === 1 && newSpeed >= 99 ? 'on' : 'off'
        await this.platform.sendDeviceUpdate(accessory, params)
      }
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
      let light
      let status
      let speed
      const lightService = accessory.getService(Service.Lightbulb)
      const fanService = accessory.getService(Service.Fanv2)
      if (Array.isArray(params.switches)) {
        light = params.switches[0].switch === 'on'
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
      } else if (Object.prototype.hasOwnProperty.call(params, 'light') && Object.prototype.hasOwnProperty.call(params, 'fan') && Object.prototype.hasOwnProperty.call(params, 'speed')) {
        light = params.light === 'on'
        status = params.fan === 'on' ? 1 : 0
        speed = params.speed * 33 * status
      } else {
        return
      }
      lightService.updateCharacteristic(Characteristic.On, light)
      fanService
        .updateCharacteristic(Characteristic.Active, status)
        .updateCharacteristic(Characteristic.RotationSpeed, speed)
      if (speed !== 0) accessory.context.cacheRotationSpeed = speed
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
