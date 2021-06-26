/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceMotor {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.eveChar = platform.eveChar
    this.funcs = platform.funcs
    this.hapChar = platform.api.hap.Characteristic
    this.hapErr = platform.api.hap.HapStatusError
    this.hapServ = platform.api.hap.Service
    this.lang = platform.lang
    this.log = platform.log
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Initially set the online flag as true (to be then updated as false if necessary)
    this.isOnline = true

    /*
      This is for the DUALR3 using motor mode
      This device's parameters are:
      motorTurn: 1=OPEN, 0=STOP, 2=CLOSE (not needed by plugin)
      location: 0=CLOSED, 100=OPEN
      currLocation: 0=CLOSED, 100=OPEN
    */

    // Set up custom variables for this device type
    const deviceConf = platform.multiDevices[accessory.context.eweDeviceId]

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

    // Add the window covering service if it doesn't already exist
    this.service =
      this.accessory.getService(this.hapServ.WindowCovering) ||
      this.accessory.addService(this.hapServ.WindowCovering)

    // Add Eve power characteristics
    if (!this.service.testCharacteristic(this.eveChar.CurrentConsumption)) {
      this.service.addCharacteristic(this.eveChar.CurrentConsumption)
    }
    if (!this.service.testCharacteristic(this.eveChar.ElectricCurrent)) {
      this.service.addCharacteristic(this.eveChar.ElectricCurrent)
    }
    if (!this.service.testCharacteristic(this.eveChar.Voltage)) {
      this.service.addCharacteristic(this.eveChar.Voltage)
    }

    // Add the set handler to the target position characteristic
    this.service
      .getCharacteristic(this.hapChar.TargetPosition)
      .onSet(async value => await this.internalPositionUpdate(value))

    // Add the get handlers only if the user has configured the offlineAsNoResponse setting
    if (platform.config.offlineAsNoResponse) {
      this.service.getCharacteristic(this.hapChar.CurrentPosition).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.CurrentPosition).value
      })
      this.service.getCharacteristic(this.hapChar.TargetPosition).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.TargetPosition).value
      })
    }

    // Set up an interval to get eWeLink to send power updates
    if (platform.config.mode !== 'lan') {
      setTimeout(() => {
        this.internalUIUpdate()
        this.intervalPoll = setInterval(() => this.internalUIUpdate(), 120000)
      }, 5000)

      // Stop the intervals on Homebridge shutdown
      platform.api.on('shutdown', () => {
        clearInterval(this.intervalPoll)
      })
    }

    // Output the customised options to the log
    const opts = JSON.stringify({
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable'
    })
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
  }

  async internalPositionUpdate (value) {
    try {
      if (this.cachePos === value) {
        return
      }
      const updateKey = Math.random()
        .toString(36)
        .substr(2, 8)
      this.updateKey = updateKey
      await this.funcs.sleep(500)
      if (updateKey !== this.updateKey) {
        return
      }
      const params = { location: value }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cachePos = value
      if (this.enableLogging) {
        this.log('[%s] %s [%s%].', this.name, this.lang.curPos, this.cachePos)
      }
    } catch (err) {
      // Catch any errors and let the platform display them
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.TargetPosition, this.cachePos)
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async internalUIUpdate () {
    try {
      // Skip polling if device isn't online
      if (!this.isOnline) {
        return
      }

      // Send the params to request the updates
      await this.platform.sendDeviceUpdate(this.accessory, { uiActive: { outlet: 0, time: 120 } })
    } catch (err) {
      this.log.error(err)
    }
  }

  async externalUpdate (params) {
    try {
      this.log(params)
      if (
        this.funcs.hasProperty(params, 'location') &&
        this.funcs.hasProperty(params, 'currLocation') &&
        params.location === params.currLocation
      ) {
        if (this.cachePos !== params.location) {
          this.cachePos = params.location
          this.service.updateCharacteristic(this.hapChar.TargetPosition, this.cachePos)
          this.service.updateCharacteristic(this.hapChar.CurrentPosition, this.cachePos)
          this.service.updateCharacteristic(this.hapChar.PositionState, 2)
          if (this.enableLogging) {
            this.log('[%s] %s [%s%].', this.name, this.lang.curPos, this.cachePos)
          }
        }
      }
      let logger = false
      let power
      let voltage
      let current
      if (this.funcs.hasProperty(params, 'actPow_00')) {
        power = parseInt(params.actPow_00) / 100
        this.service.updateCharacteristic(this.eveChar.CurrentConsumption, power)
        logger = true
      }
      if (this.funcs.hasProperty(params, 'voltage_00')) {
        voltage = parseInt(params.voltage_00) / 100
        this.service.updateCharacteristic(this.eveChar.Voltage, voltage)
        logger = true
      }
      if (this.funcs.hasProperty(params, 'current_00')) {
        current = parseInt(params.current_00) / 100
        this.service.updateCharacteristic(this.eveChar.ElectricCurrent, current)
        logger = true
      }
      if (params.updateSource && logger && this.enableLogging) {
        this.log(
          '[%s] %s%s%s.',
          this.name,
          power !== undefined ? this.lang.curPower + ' [' + power + 'W]' : '',
          voltage !== undefined ? ' ' + this.lang.curVolt + ' [' + voltage + 'V]' : '',
          current !== undefined ? ' ' + this.lang.curCurr + ' [' + current + 'A]' : ''
        )
      }
    } catch (err) {
      // Catch any errors and let the platform display them
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
