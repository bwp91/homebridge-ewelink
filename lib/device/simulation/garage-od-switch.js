/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceGarageODSwitch {
  constructor (platform, accessory) {
    this.platform = platform
    this.funcs = platform.funcs
    this.messages = platform.messages
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.name = accessory.displayName
    this.accessory = accessory

    this.garageId = platform.obstructSwitches[this.accessory.context.eweDeviceId]
    this.garage = platform.devicesInHB.get(this.garageId + 'SWX')

    this.service = this.accessory.getService(this.hapServ.Switch) || this.accessory.addService(this.hapServ.Switch)
    this.service.getCharacteristic(this.hapChar.On)
      .on('set', this.internalUpdate.bind(this))

    this.gService = this.garage.getService(this.hapServ.GarageDoorOpener)
    this.gService.updateCharacteristic(
      this.hapChar.ObstructionDetected,
      this.service.getCharacteristic(this.hapChar.On).value
    )
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      await this.platform.sendDeviceUpdate(this.accessory, {
        switch: value ? 'on' : 'off'
      })
      this.cacheOnOff = value ? 'on' : 'off'
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
      }
      this.gService.updateCharacteristic(this.hapChar.ObstructionDetected, value)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switch || params.switch === this.cacheOnOff) {
        return
      }
      const newStatus = params.switch === 'on'
      this.service.updateCharacteristic(this.hapChar.On, newStatus)
      this.gService.updateCharacteristic(this.hapChar.ObstructionDetected, newStatus)
      this.cacheOnOff = params.switch
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, this.cacheOnOff)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
