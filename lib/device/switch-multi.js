/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSwitchMulti {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.multiDevices[deviceId]
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Add the switch service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.Switch) ||
      this.accessory.addService(this.hapServ.Switch)

    // Add the set handler to the switch on/off characteristic
    this.service.getCharacteristic(this.hapChar.On)
      .on('set', this.internalUpdate.bind(this))

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('switch', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({ disableDeviceLogging: this.disableDeviceLogging })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async internalUpdate (value, callback) {
    try {
      await this.funcs.sleep(Math.floor(Math.random() * 241 + 10))
      callback()
      let oAccessory
      let masterState = 'off'
      const params = {}
      switch (this.accessory.context.switchNumber) {
        case '0':
          params.switches = this.consts.defaultMultiSwitchOff
          params.switches[0].switch = value ? 'on' : 'off'
          params.switches[1].switch = value ? 'on' : 'off'
          params.switches[2].switch = value ? 'on' : 'off'
          params.switches[3].switch = value ? 'on' : 'off'
          for (let i = 0; i <= 4; i++) {
            if ((oAccessory = this.platform.devicesInHB.get(this.accessory.context.eweDeviceId + 'SW' + i))) {
              oAccessory.getService(this.hapServ.Switch).updateCharacteristic(this.hapChar.On, value)
              oAccessory.context.cacheOnOff = value ? 'on' : 'off'
              oAccessory.eveService.addEntry({ status: value ? 1 : 0 })
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
          params.switches = this.consts.defaultMultiSwitchOff
          for (let i = 1; i <= 4; i++) {
            if ((oAccessory = this.platform.devicesInHB.get(this.accessory.context.eweDeviceId + 'SW' + i))) {
              if (oAccessory.getService(this.hapServ.Switch).getCharacteristic(this.hapChar.On).value) {
                masterState = 'on'
              }
              if (i === parseInt(this.accessory.context.switchNumber)) {
                params.switches[i - 1].switch = value ? 'on' : 'off'
                oAccessory.context.cacheOnOff = value ? 'on' : 'off'
                oAccessory.eveService.addEntry({ status: value ? 1 : 0 })
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
          if (!this.platform.hideMasters.includes(this.accessory.context.eweDeviceId)) {
            oAccessory = this.platform.devicesInHB.get(this.accessory.context.eweDeviceId + 'SW0')
            oAccessory.getService(this.hapServ.Switch).updateCharacteristic(this.hapChar.On, masterState === 'on')
            oAccessory.eveService.addEntry({ status: masterState === 'on' ? 1 : 0 })
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
        if (params.switches[i - 1].switch === 'on') {
          primaryState = true
        }
        if (this.platform.devicesInHB.has(idToCheck + i)) {
          const oAccessory = this.platform.devicesInHB.get(idToCheck + i)
          if (params.switches[i - 1].switch === oAccessory.context.cacheOnOff) {
            continue
          }
          oAccessory.getService(this.hapServ.Switch)
            .updateCharacteristic(this.hapChar.On, params.switches[i - 1].switch === 'on')
          oAccessory.context.cacheOnOff = params.switches[i - 1].switch
          oAccessory.eveService.addEntry({ status: params.switches[i - 1].switch === 'on' ? 1 : 0 })
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] current state [%s].', oAccessory.displayName, params.switches[i - 1].switch)
          }
        }
      }
      if (!this.platform.hideMasters.includes(this.accessory.context.eweDeviceId)) {
        this.service.updateCharacteristic(this.hapChar.On, primaryState)
        this.accessory.eveService.addEntry({ status: primaryState ? 1 : 0 })
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
