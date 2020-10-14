/* jshint -W014, -W033, esversion: 9 */
'use strict'
let Characteristic, Service
const cns = require('./../constants')
const utils = require('./../utils')
module.exports = class deviceSwitch {
  constructor (platform, accessory) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
    const switchService = accessory.getService(Service.Switch) || accessory.addService(Service.Switch)
    switchService
      .getCharacteristic(Characteristic.On)
      .on('set', (value, callback) => this.internalUpdate(accessory, value, callback))
  }

  async internalUpdate (accessory, value, callback) {
    callback()
    try {
      let oAccessory
      const params = {}
      const switchService = accessory.getService(Service.Switch)
      switch (accessory.context.switchNumber) {
        case 'X':
          params.switch = value ? 'on' : 'off'
          break
        case '0':
          params.switches = cns.defaultMultiSwitchOff
          params.switches[0].switch = value ? 'on' : 'off'
          params.switches[1].switch = value ? 'on' : 'off'
          params.switches[2].switch = value ? 'on' : 'off'
          params.switches[3].switch = value ? 'on' : 'off'
          break
        case '1':
        case '2':
        case '3':
        case '4':
          params.switches = cns.defaultMultiSwitchOff
          for (let i = 1; i <= 4; i++) {
            if ((oAccessory = this.platform.devicesInHB.get(accessory.context.eweDeviceId + 'SW' + i))) {
              if (i === parseInt(accessory.context.switchNumber)) {
                params.switches[i - 1].switch = value ? 'on' : 'off'
              } else {
                params.switches[i - 1].switch = oAccessory.context.cacheOn ? 'on' : 'off'
              }
            } else {
              params.switches[i - 1].switch = 'off'
            }
          }
          break
      }
      await this.platform.sendDeviceUpdate(accessory, params)
      switch (accessory.context.switchNumber) {
        case 'X':
          switchService.updateCharacteristic(Characteristic.On, value)
          break
        case '0':
          for (let i = 0; i <= 4; i++) {
            if ((oAccessory = this.platform.devicesInHB.get(accessory.context.eweDeviceId + 'SW' + i))) {
              oAccessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, value)
            }
          }
          break
        case '1':
        case '2':
        case '3':
        case '4': {
          switchService.updateCharacteristic(Characteristic.On, value)
          let masterState = 'off'
          for (let i = 1; i <= 4; i++) {
            if ((oAccessory = this.platform.devicesInHB.get(accessory.context.eweDeviceId + 'SW' + i))) {
              if (oAccessory.getService(Service.Switch).getCharacteristic(Characteristic.On).value) {
                masterState = 'on'
              }
            }
          }
          if (!this.platform.hiddenMasters.includes(accessory.context.eweDeviceId)) {
            oAccessory = this.platform.devicesInHB.get(accessory.context.eweDeviceId + 'SW0')
            oAccessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, masterState === 'on')
          }
          break
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {
      if (cns.devicesSingleSwitch.includes(accessory.context.eweUIID)) {
        if (!utils.hasProperty(params, 'switch')) return
        accessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, params.switch === 'on')
      } else if (cns.devicesMultiSwitch.includes(accessory.context.eweUIID)) {
        if (!utils.hasProperty(params, 'switches')) return
        const idToCheck = accessory.context.hbDeviceId.slice(0, -1)
        let primaryState = false
        for (let i = 1; i <= accessory.context.channelCount; i++) {
          if (params.switches[i - 1].switch === 'on') {
            primaryState = true
          }
          if (this.platform.devicesInHB.has(idToCheck + i)) {
            const oAccessory = this.platform.devicesInHB.get(idToCheck + i)
            oAccessory.context.cacheOn = params.switches[i - 1].switch === 'on'
            oAccessory
              .getService(Service.Switch)
              .updateCharacteristic(Characteristic.On, params.switches[i - 1].switch === 'on')
          }
        }
        if (!this.platform.hiddenMasters.includes(accessory.context.eweDeviceId)) {
          accessory.getService(Service.Switch).updateCharacteristic(Characteristic.On, primaryState)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}