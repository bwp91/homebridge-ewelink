/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class deviceGarageODSwitch {
  constructor (platform, accessory) {
    this.platform = platform
    this.log = platform.log
    this.disableDeviceLogging = platform.config.disableDeviceLogging
    this.helpers = platform.helpers
    this.S = platform.api.hap.Service
    this.C = platform.api.hap.Characteristic
    this.dName = accessory.displayName
    this.accessory = accessory

    this.garageId = platform.obstructSwitches[this.accessory.context.eweDeviceId]
    this.garage = platform.devicesInHB.get(this.garageId + 'SWX')

    this.service = this.accessory.getService(this.S.Switch) || this.accessory.addService(this.S.Switch)
    this.service.getCharacteristic(this.C.On)
      .on('set', this.internalUpdate.bind(this))

    this.gService = this.garage.getService(this.S.GarageDoorOpener)
    this.gService.updateCharacteristic(
      this.C.ObstructionDetected,
      this.service.getCharacteristic(this.C.On).value
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
        this.log('[%s] current state [%s].', this.dName, this.cacheOnOff)
      }
      this.gService.updateCharacteristic(this.C.ObstructionDetected, value)
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
      this.service.updateCharacteristic(this.C.On, newStatus)
      this.gService.updateCharacteristic(this.C.On, newStatus)
      this.cacheOnOff = params.switch
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.dName, this.cacheOnOff)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
