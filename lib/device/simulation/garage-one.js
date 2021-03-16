/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceGarageOne {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.eveChar = platform.eveChar
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.simulations[deviceId]
    this.setup = deviceConf.setup
    this.operationTimeUp = deviceConf.operationTime ||
      this.consts.defaultValues.operationTime
    this.operationTimeDown = deviceConf.operationTimeDown || this.operationTimeUp
    this.disableDeviceLogging = deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // Set up the accessory with default positions when added the first time
    if (!this.funcs.hasProperty(this.accessory.context, 'cacheCurrentDoorState')) {
      this.accessory.context.cacheCurrentDoorState = 1
      this.accessory.context.cacheTargetDoorState = 1
    }

    // Check for a valid setup
    if (!this.consts.allowed.setups.includes(this.setup)) {
      this.error = "device has not been set up as 'oneSwitch' or 'twoSwitch'"
    }

    // Check the sensor is valid if defined by the user
    if (deviceConf.sensorId) {
      // Check the sensor exists in Homebridge
      if (!platform.devicesInHB.has(deviceConf.sensorId + 'SWX')) {
        this.error = 'defined sensor does not exist in Homebridge'
      }

      // Check the sensor is a sensor
      if (platform.devicesInHB.get(deviceConf.sensorId + 'SWX').context.eweUIID !== 102) {
        this.error = 'defined sensor is not a DW2 sensor'
      }
      this.definedSensor = this.platform.devicesInHB.get(deviceConf.sensorId + 'SWX')

      // Check the sensor has the ContactSensor service
      if (!this.definedSensor.getService(this.hapServ.ContactSensor)) {
        this.error = 'defined sensor is not configured as a sensor'
      }
    }

    // If the accessory has a switch service then remove it
    if (this.accessory.getService(this.hapServ.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
    }

    // If the accessory has a contact sensor service then remove it
    if (this.accessory.getService(this.hapServ.ContactSensor)) {
      this.accessory.removeService(
        this.accessory.getService(this.hapServ.ContactSensor)
      )
    }

    // Add the garage door service if it doesn't already exist
    if (!(this.service = this.accessory.getService(this.hapServ.GarageDoorOpener))) {
      this.service = this.accessory.addService(this.hapServ.GarageDoorOpener)
      this.service.setCharacteristic(this.hapChar.CurrentDoorState, 1)
      this.service.setCharacteristic(this.hapChar.TargetDoorState, 1)
      this.service.setCharacteristic(this.hapChar.ObstructionDetected, false)
      this.service.addCharacteristic(this.hapChar.ContactSensorState)
      this.service.addCharacteristic(this.eveChar.LastActivation)
      this.service.addCharacteristic(this.eveChar.ResetTotal)
      this.service.addCharacteristic(this.eveChar.OpenDuration)
      this.service.addCharacteristic(this.eveChar.ClosedDuration)
      this.service.addCharacteristic(this.eveChar.TimesOpened)
    }

    // Obtain the current times opened value
    this.timesOpened = this.service.getCharacteristic(this.eveChar.TimesOpened).value

    // Add the set handler to the garage door reset total characteristic
    this.service.getCharacteristic(this.eveChar.ResetTotal)
      .on('set', (value, callback) => {
        callback()
        this.timesOpened = 0
        this.service.updateCharacteristic(this.eveChar.TimesOpened, 0)
      })

    // Add the set handler to the target position characteristic
    this.service.getCharacteristic(this.hapChar.TargetDoorState)
      .on('set', this.internalUpdate.bind(this))

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('door', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        operationTimeDown: this.operationTimeDown,
        operationTimeUp: this.operationTimeUp,
        setup: this.setup,
        type: deviceConf.type
      })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async internalUpdate (value, callback) {
    try {
      callback()
      if (this.error) {
        this.log.warn('[%s] invalid config - %s.', this.name, this.error)
        return
      }
      const newPos = value
      const params = {}
      let delay = 0
      const prevState = this.definedSensor
        ? this.definedSensor.getService(this.hapServ.ContactSensor)
          .getCharacteristic(this.hapChar.ContactSensorState).value === 0
          ? 1
          : 0
        : this.accessory.context.cacheCurrentDoorState
      if (newPos === prevState % 2) {
        return
      }
      this.inUse = true
      this.cacheState = value
      if (this.setup === 'oneSwitch' && [2, 3].includes(prevState)) {
        this.service.updateCharacteristic(
          this.hapChar.CurrentDoorState,
          ((prevState * 2) % 3) + 2
        )
        this.accessory.context.cacheCurrentDoorState = ((prevState * 2) % 3) + 2
        delay = 1500
      }
      if (this.cacheState !== newPos) {
        return
      }
      await this.funcs.sleep(delay)
      this.service.updateCharacteristic(this.hapChar.TargetDoorState, newPos)
        .updateCharacteristic(this.hapChar.CurrentDoorState, newPos + 2)
      this.accessory.context.cacheTargetDoorState = newPos
      this.accessory.context.cacheCurrentDoorState = newPos + 2
      switch (this.setup) {
        case 'oneSwitch':
          params.switch = 'on'
          break
        case 'twoSwitch':
          params.switches = this.accessory.context.eweUIID === 126
            ? this.consts.defaultDoubleSwitchOff
            : this.consts.defaultMultiSwitchOff
          params.switches[0].switch = newPos === 0 ? 'on' : 'off'
          params.switches[1].switch = newPos === 1 ? 'on' : 'off'
          break
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      await this.funcs.sleep(2000)
      this.inUse = false
      const operationTime = newPos === 0 ? this.operationTimeUp : this.operationTimeDown
      await this.funcs.sleep(Math.max((operationTime - 20) * 100, 0))
      if (!this.definedSensor) {
        this.service.updateCharacteristic(this.hapChar.CurrentDoorState, newPos)
        this.accessory.context.cacheCurrentDoorState = newPos
        if (!this.disableDeviceLogging) {
          this.log(
            '[%s] current state [%s].',
            this.name,
            newPos === 0 ? 'open' : 'closed'
          )
        }
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.error) {
        this.log.warn('[%s] invalid config - %s.', this.name, this.error)
        return
      }
      if ((!params.switch && !params.switches) || this.inUse || this.definedSensor) {
        return
      }
      const prevState = this.accessory.context.cacheCurrentDoorState
      const newPos = [0, 2].includes(prevState) ? 3 : 2
      switch (this.setup) {
        case 'oneSwitch':
          if (params.switch === 'off') {
            return
          }
          break
        case 'twoSwitch':
          if (
            params.switches[0].switch === params.switches[1].switch ||
            params.switches[prevState % 2].switch === 'on'
          ) {
            return
          }
          break
      }
      this.inUse = true
      this.service.updateCharacteristic(this.hapChar.TargetDoorState, newPos - 2)
        .updateCharacteristic(this.hapChar.CurrentDoorState, newPos)
      this.accessory.context.cacheCurrentDoorState = newPos
      this.accessory.context.cacheTargetDoorState = newPos - 2
      await this.funcs.sleep(2000)
      this.inUse = false
      const operationTime = newPos === 2 ? this.operationTimeUp : this.operationTimeDown
      await this.funcs.sleep(Math.max((operationTime - 20) * 100, 0))
      this.service.updateCharacteristic(this.hapChar.CurrentDoorState, newPos - 2)
      this.accessory.context.cacheCurrentDoorState = newPos - 2
      if (!this.disableDeviceLogging) {
        this.log('[%s] current state [%s].', this.name, newPos === 2 ? 'open' : 'closed')
      }
    } catch (err) {
      this.inUse = false
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
