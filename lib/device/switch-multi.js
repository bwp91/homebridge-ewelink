/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceSwitchMulti {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    this.dName = accessory.displayName
    this.accessory = accessory

    this.service = this.accessory.getService(this.S.Switch) || this.accessory.addService(this.S.Switch)
    this.service.getCharacteristic(this.C.On)
      .on('set', this.internalUpdate.bind(this))
    this.accessory.log = platform.config.debugFakegato ? this.log : () => {}
    this.accessory.historyService = new this.platform.eveService('switch', this.accessory, {
      storage: 'fs',
      path: platform.eveLogPath
    })
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
              oAccessory.getService(this.S.Switch).updateCharacteristic(this.C.On, value)
              oAccessory.context.cacheOnOff = value ? 'on' : 'off'
              oAccessory.historyService.addEntry({
                time: Math.round(new Date().valueOf() / 1000),
                status: value ? 1 : 0
              })
              if (i > 0 && !this.disableDeviceLogging) {
                this.log('[%s] current state [%s].', oAccessory.displayName, value ? 'on' : 'off')
              }
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
              if (oAccessory.getService(this.S.Switch).getCharacteristic(this.C.On).value) {
                masterState = 'on'
              }
              if (i === parseInt(this.accessory.context.switchNumber)) {
                params.switches[i - 1].switch = value ? 'on' : 'off'
                oAccessory.context.cacheOnOff = value ? 'on' : 'off'
                oAccessory.historyService.addEntry({
                  time: Math.round(new Date().valueOf() / 1000),
                  status: value ? 1 : 0
                })
                if (i > 0 && !this.disableDeviceLogging) {
                  this.log('[%s] current state [%s].', oAccessory.displayName, value ? 'on' : 'off')
                }
              } else {
                params.switches[i - 1].switch = oAccessory.context.cacheOnOff
              }
            } else {
              params.switches[i - 1].switch = 'off'
            }
          }
          if (!this.platform.hiddenMasters.includes(this.accessory.context.eweDeviceId)) {
            oAccessory = this.platform.devicesInHB.get(this.accessory.context.eweDeviceId + 'SW0')
            oAccessory.getService(this.S.Switch).updateCharacteristic(this.C.On, masterState === 'on')
            oAccessory.historyService.addEntry({
              time: Math.round(new Date().valueOf() / 1000),
              status: masterState === 'on' ? 1 : 0
            })
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
      if (!params.switches) {
        return
      }
      const idToCheck = this.accessory.context.eweDeviceId + 'SW'
      let primaryState = false
      for (let i = 1; i <= this.accessory.context.channelCount; i++) {
        if (params.switches[i - 1].switch === 'on') primaryState = true
        if (this.platform.devicesInHB.has(idToCheck + i)) {
          const oAccessory = this.platform.devicesInHB.get(idToCheck + i)
          if (params.switches[i - 1].switch === oAccessory.context.cacheOnOff) continue
          oAccessory.getService(this.S.Switch)
            .updateCharacteristic(this.C.On, params.switches[i - 1].switch === 'on')
          oAccessory.context.cacheOnOff = params.switches[i - 1].switch
          oAccessory.historyService.addEntry({
            time: Math.round(new Date().valueOf() / 1000),
            status: params.switches[i - 1].switch === 'on' ? 1 : 0
          })
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current state [%s].', oAccessory.displayName, params.switches[i - 1].switch)
          }
        }
      }
      if (!this.platform.hiddenMasters.includes(this.accessory.context.eweDeviceId)) {
        this.service.updateCharacteristic(this.C.On, primaryState)
        this.accessory.historyService.addEntry({
          time: Math.round(new Date().valueOf() / 1000),
          status: primaryState ? 1 : 0
        })
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
