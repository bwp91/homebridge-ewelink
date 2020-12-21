/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceSwitchMulti {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.helpers = platform.helpers
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.switchService = accessory.getService(this.Service.Switch) || accessory.addService(this.Service.Switch)
    this.switchService
      .getCharacteristic(this.Characteristic.On)
      .on('set', this.internalUpdate.bind(this))
    accessory.log = this.log
    accessory.eveService = new this.platform.eveService('switch', accessory)
    this.accessory = accessory
  }

  async internalUpdate (value, callback) {
    try {
      await this.helpers.sleep(Math.floor(Math.random() * 491 + 10))
      callback()
      let oAccessory
      let masterState = 'off'
      const params = {}
      switch (this.accessory.context.switchNumber) {
        case '0':
          params.switches = this.helpers.defaultMultiSwitchOff
          params.switches[0].switch = value ? 'on' : 'off'
          params.switches[1].switch = value ? 'on' : 'off'
          params.switches[2].switch = value ? 'on' : 'off'
          params.switches[3].switch = value ? 'on' : 'off'
          for (let i = 0; i <= 4; i++) {
            if ((oAccessory = this.platform.devicesInHB.get(this.accessory.context.eweDeviceId + 'SW' + i))) {
              oAccessory.getService(this.Service.Switch).updateCharacteristic(this.Characteristic.On, value)
              oAccessory.context.cacheStatus = value ? 'on' : 'off'
            }
          }
          break
        case '1':
        case '2':
        case '3':
        case '4':
          params.switches = this.helpers.defaultMultiSwitchOff
          for (let i = 1; i <= 4; i++) {
            if ((oAccessory = this.platform.devicesInHB.get(this.accessory.context.eweDeviceId + 'SW' + i))) {
              if (oAccessory.getService(this.Service.Switch).getCharacteristic(this.Characteristic.On).value) {
                masterState = 'on'
              }
              if (i === parseInt(this.accessory.context.switchNumber)) {
                params.switches[i - 1].switch = value ? 'on' : 'off'
                oAccessory.context.cacheStatus = value ? 'on' : 'off'
              } else {
                params.switches[i - 1].switch = oAccessory.context.cacheStatus
              }
            } else {
              params.switches[i - 1].switch = 'off'
            }
          }
          if (!this.platform.hiddenMasters.includes(this.accessory.context.eweDeviceId)) {
            oAccessory = this.platform.devicesInHB.get(this.accessory.context.eweDeviceId + 'SW0')
            oAccessory.getService(this.Service.Switch).updateCharacteristic(this.Characteristic.On, masterState === 'on')
          }
          break
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switches) return
      const idToCheck = this.accessory.context.eweDeviceId + 'SW'
      let primaryState = false
      for (let i = 1; i <= this.accessory.context.channelCount; i++) {
        if (params.switches[i - 1].switch === 'on') primaryState = true
        if (this.platform.devicesInHB.has(idToCheck + i)) {
          const oAccessory = this.platform.devicesInHB.get(idToCheck + i)
          if (params.switches[i - 1].switch === oAccessory.context.cacheStatus) return
          oAccessory.context.cacheStatus = params.switches[i - 1].switch
          oAccessory
            .getService(this.Service.Switch)
            .updateCharacteristic(this.Characteristic.On, params.switches[i - 1].switch === 'on')
          oAccessory.eveService.addEntry({ status: params.switches[i - 1].switch === 'on' ? 1 : 0 })
          if (params.updateSource) this.log('[%s] current status [%s].', oAccessory.displayName, params.switches[i - 1].switch)
        }
      }
      if (!this.platform.hiddenMasters.includes(this.accessory.context.eweDeviceId)) {
        this.switchService.updateCharacteristic(this.Characteristic.On, primaryState)
        this.accessory.eveService.addEntry({ status: primaryState ? 1 : 0 })
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
