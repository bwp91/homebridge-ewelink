/* jshint node: true, esversion: 10, -W014, -W033 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSwitchMate {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.funcs = platform.funcs
    this.hapChar = platform.api.hap.Characteristic
    this.hapServ = platform.api.hap.Service
    this.lang = platform.lang
    this.log = platform.log
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceConf = platform.deviceConf[accessory.context.eweDeviceId]

    // Set the correct logging variables for this accessory
    this.enableLogging = !platform.config.disableDeviceLogging
    this.enableDebugLogging = platform.config.debug
    if (deviceConf && deviceConf.overrideLogging) {
      switch (deviceConf.overrideLogging) {
        case 'standard':
          this.enableLogging = true
          this.enableDebugLogging = false
          break
        case 'debug':
          this.enableLogging = true
          this.enableDebugLogging = true
          break
        case 'disable':
          this.enableLogging = false
          this.enableDebugLogging = false
          break
      }
    }
    this.timeouts = {
      0: false,
      1: false,
      2: false
    }

    // Add the stateless switch service if it doesn't already exist
    this.service =
      this.accessory.getService(this.hapServ.StatelessProgrammableSwitch) ||
      this.accessory.addService(this.hapServ.StatelessProgrammableSwitch)

    // Output the customised options to the log
    const opts = JSON.stringify({
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable'
    })
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
  }

  async externalUpdate (params) {
    try {
      if (
        this.funcs.hasProperty(params, 'outlet') &&
        [0, 1, 2].includes(params.outlet) &&
        params.actionTime &&
        !this.timeouts[params.outlet]
      ) {
        this.timeouts[params.outlet] = true
        setTimeout(() => {
          this.timeouts[params.outlet] = false
        }, 1000)
        const timeDiff = (new Date().getTime() - Date.parse(params.actionTime)) / 1000
        if (timeDiff < 5) {
          this.service.updateCharacteristic(this.hapChar.ProgrammableSwitchEvent, params.outlet)
          if (params.updateSource && this.enableLogging) {
            const textLabel =
              params.key === 0
                ? this.lang.buttonSingle
                : params.key === 1
                ? this.lang.buttonDouble
                : this.lang.buttonLong
            this.log('[%s] %s [%s].', this.name, this.lang.curState, textLabel)
          }
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
