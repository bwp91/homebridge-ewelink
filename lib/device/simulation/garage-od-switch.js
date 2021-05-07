/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceGarageODSwitch {
  constructor (platform, accessory, devicesInHB) {
    // Set up variables from the platform
    this.hapChar = platform.api.hap.Characteristic
    this.hapServ = platform.api.hap.Service
    this.hapUUIDGen = platform.api.hap.uuid.generate
    this.lang = platform.lang
    this.log = platform.log
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    this.garageId = platform.obstructSwitches[accessory.context.eweDeviceId]
    const uuid = this.hapUUIDGen(this.garageId + 'SWX')
    this.garage = devicesInHB.get(uuid)
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
    if (platform.config.debug) {
      const opts = JSON.stringify({ disableDeviceLogging: this.disableDeviceLogging })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async externalUpdate (params) {
    try {
      if (!params.switch || params.switch === this.cacheState) {
        return
      }
      const newStatus = params.switch === 'on'
      this.service.updateCharacteristic(this.hapChar.On, newStatus)
      this.gService.updateCharacteristic(this.hapChar.ObstructionDetected, newStatus)
      this.cacheState = params.switch
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
