/* jshint node: true,esversion: 9, -W014, -W033 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceRFSensor {
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

    // Initially set the online flag as true (to be then updated as false if necessary)
    this.isOnline = true

    // Set up custom variables for this device type
    const deviceConf = platform.rfSubdevices[accessory.context.hbDeviceId]
    this.sensorTimeLength =
      deviceConf && deviceConf.sensorTimeLength
        ? deviceConf.sensorTimeLength
        : platform.consts.defaultValues.sensorTimeLength
    this.sensorTimeDifference =
      deviceConf && deviceConf.sensorTimeDifference
        ? deviceConf.sensorTimeDifference
        : platform.consts.defaultValues.sensorTimeDifference
    this.sensorType = deviceConf && deviceConf.type ? deviceConf.type : 'motion'

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

    // This instance is a sensor which the user can define as different types
    let serv
    let char
    let eveType
    let addLACharacteristic = false

    // Create an array of hap sensor services to for later to check sensor type hasn't changed
    let hapServList = [
      this.hapServ.LeakSensor,
      this.hapServ.SmokeSensor,
      this.hapServ.CarbonMonoxideSensor,
      this.hapServ.CarbonDioxideSensor,
      this.hapServ.ContactSensor,
      this.hapServ.OccupancySensor,
      this.hapServ.MotionSensor,
      this.hapServ.StatelessProgrammableSwitch,
      this.hapServ.Doorbell
    ]

    // Check which type this sensor is and get the correct service/characteristic
    switch (this.sensorType) {
      case 'water':
        serv = this.hapServ.LeakSensor
        char = this.hapChar.LeakDetected
        eveType = 'motion'
        break
      case 'fire':
      case 'smoke':
        serv = this.hapServ.SmokeSensor
        char = this.hapChar.SmokeDetected
        eveType = 'motion'
        break
      case 'co':
        serv = this.hapServ.CarbonMonoxideSensor
        char = this.hapChar.CarbonMonoxideDetected
        eveType = 'motion'
        break
      case 'co2':
        serv = this.hapServ.CarbonDioxideSensor
        char = this.hapChar.CarbonDioxideDetected
        eveType = 'motion'
        break
      case 'contact':
        serv = this.hapServ.ContactSensor
        char = this.hapChar.ContactSensorState
        eveType = 'door'
        addLACharacteristic = true
        break
      case 'occupancy':
        serv = this.hapServ.OccupancySensor
        char = this.hapChar.OccupancyDetected
        eveType = 'motion'
        break
      case 'p_button':
        serv = this.hapServ.StatelessProgrammableSwitch
        char = this.hapChar.ProgrammableSwitchEvent
        break
      case 'doorbell':
        serv = this.hapServ.Doorbell
        char = this.hapChar.ProgrammableSwitchEvent
        break
      default:
        serv = this.hapServ.MotionSensor
        char = this.hapChar.MotionDetected
        eveType = 'motion'
        addLACharacteristic = true
        break
    }

    // Remove wanted sensor from hap sensor type list
    hapServList = hapServList.filter(el => el !== serv)

    // Check and remove and redundant hap sensor types
    hapServList.forEach(hapSensor => {
      if (accessory.getService(hapSensor)) {
        accessory.removeService(accessory.getService(hapSensor))
      }
    })

    // Add the sensor if it doesn't already exist
    let service
    if (!(service = accessory.getService(serv))) {
      service = accessory.addService(serv)
    }

    // Remove double and long press from Button and Doorbell service
    if (char === this.hapChar.ProgrammableSwitchEvent) {
      service.getCharacteristic(this.hapChar.ProgrammableSwitchEvent).setProps({
        validValues: [0]
      })
    } else {
      // Always start with the sensor off (useful when restarting Homebridge, except Doorbell)
      service.updateCharacteristic(char, 0)
    }

    // See if we need to add or remove the Last Activation characteristic
    if (addLACharacteristic) {
      if (!service.testCharacteristic(this.eveChar.LastActivation)) {
        service.addCharacteristic(this.eveChar.LastActivation)
      }
    } else {
      if (service.testCharacteristic(this.eveChar.LastActivation)) {
        service.removeCharacteristic(service.getCharacteristic(this.eveChar.LastActivation))
      }
    }

    // Add the get handlers only if the user hasn't disabled the disableNoResponse setting
    if (!platform.config.disableNoResponse) {
      service.getCharacteristic(char).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return service.getCharacteristic(char).value
      })
    }

    // Pass the accessory to Fakegato to set up with Eve
    accessory.eveService = new platform.eveService(eveType, accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log
    const opts = JSON.stringify({
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable',
      sensorTimeDifference: this.sensorTimeDifference,
      sensorTimeLength: this.sensorTimeLength,
      type: this.sensorType
    })
    this.log('[%s] %s %s.', accessory.displayName, this.lang.devInitOpts, opts)
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
