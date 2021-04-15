/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceGarageODSwitch {
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
    this.garageId = platform.obstructSwitches[this.accessory.context.eweDeviceId]
    const uuid = this.platform.api.hap.uuid.generate(this.garageId + 'SWX')
    this.garage = platform.devicesInHB.get(uuid)
    this.disableDeviceLogging = platform.simulations[this.garageId] &&
      platform.simulations[this.garageId].overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Add the switch service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.Switch) ||
      this.accessory.addService(this.hapServ.Switch)

    // Get the garage door accessory to which this switch relates
    this.gService = this.garage.getService(this.hapServ.GarageDoorOpener)

    // Update the obstruction detected of the garage depending on the switch state
    this.gService.updateCharacteristic(
      this.hapChar.ObstructionDetected,
      this.service.getCharacteristic(this.hapChar.On).value
    )

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({ disableDeviceLogging: this.disableDeviceLogging })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
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
