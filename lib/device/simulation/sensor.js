/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSensor {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.eveChar = platform.eveChar
    this.funcs = platform.funcs
    this.hapChar = platform.api.hap.Characteristic
    this.hapServ = platform.api.hap.Service
    this.lang = platform.lang
    this.log = platform.log
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Initially set the online flag as true (to be then updated as false if necessary)
    this.isOnline = true

    // Set up custom variables for this device type
    const deviceConf = platform.simulations[accessory.context.eweDeviceId]
    this.sensorType = deviceConf.sensorType || 'motion'

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

    // If the accessory has a switch service then remove it
    if (this.accessory.getService(this.hapServ.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
    }

    // If the accessory has an outlet service then remove it
    if (this.accessory.getService(this.hapServ.Outlet)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Outlet))
    }

    // This instance is a sensor which the user can define as different types
    let serv
    let eveType

    // Check which type this sensor is and get the correct service/characteristic
    switch (this.sensorType) {
      case 'water':
        serv = this.hapServ.LeakSensor
        this.char = this.hapChar.LeakDetected
        eveType = 'motion'
        break
      case 'fire':
      case 'smoke':
        serv = this.hapServ.SmokeSensor
        this.char = this.hapChar.SmokeDetected
        eveType = 'motion'
        break
      case 'co':
        serv = this.hapServ.CarbonMonoxideSensor
        this.char = this.hapChar.CarbonMonoxideDetected
        eveType = 'motion'
        break
      case 'co2':
        serv = this.hapServ.CarbonDioxideSensor
        this.char = this.hapChar.CarbonDioxideDetected
        eveType = 'motion'
        break
      case 'contact':
        serv = this.hapServ.ContactSensor
        this.char = this.hapChar.ContactSensorState
        eveType = 'door'
        this.useLastActivation = true
        break
      case 'occupancy':
        serv = this.hapServ.OccupancySensor
        this.char = this.hapChar.OccupancyDetected
        eveType = 'motion'
        break
      default:
        serv = this.hapServ.MotionSensor
        this.char = this.hapChar.MotionDetected
        eveType = 'motion'
        this.useLastActivation = true
        break
    }

    // Add the sensor if it doesn't already exist
    if (!(this.service = this.accessory.getService(serv))) {
      this.service = this.accessory.addService(serv)
      if (this.useLastActivation) {
        this.service.addCharacteristic(this.eveChar.LastActivation)
      }
    }

    this.service.getCharacteristic(this.char).onGet(() => {
      if (!this.isOnline && platform.config.offlineAsNoResponse) {
        throw new this.hapErr(-70402)
      }
      return this.service.getCharacteristic(this.char).value
    })

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService(eveType, this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log
    const opts = JSON.stringify({
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable',
      sensorType: this.sensorType
    })
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
  }

  async externalUpdate (params) {
    try {
      if (params.switches) {
        if (params.switches[0].switch === this.cacheState) {
          return
        }
        this.cacheState = params.switches[0].switch
      } else if (params.switch) {
        if (params.switch === this.cacheState) {
          return
        }
        this.cacheState = params.switch
      } else {
        return
      }
      if (this.cacheState === 'on') {
        this.service.updateCharacteristic(this.char, 1)
        this.accessory.eveService.addEntry({ status: 1 })
        if (this.useLastActivation) {
          const initialTime = this.accessory.eveService.getInitialTime()
          this.service.updateCharacteristic(
            this.eveChar.LastActivation,
            Math.round(new Date().valueOf() / 1000) - initialTime
          )
        }
      } else {
        this.service.updateCharacteristic(this.char, 0)
        this.accessory.eveService.addEntry({ status: 0 })
      }
      if (params.updateSource && this.enableLogging) {
        this.log(
          '[%s] %s [%s].',
          this.name,
          this.lang.curState,
          this.cacheState === 'on' ? this.lang.sensorYes : this.lang.sensorNo
        )
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
