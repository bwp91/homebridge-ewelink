/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSensorContact {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.eveChar = platform.eveChar
    this.log = platform.log
    this.lang = platform.lang
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.sensorDevices[deviceId]
    this.lowBattThreshold = deviceConf && deviceConf.lowBattThreshold
      ? Math.min(deviceConf.lowBattThreshold, 100)
      : platform.consts.defaultValues.lowBattThreshold
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // If the accessory has a leak sensor service then remove it
    if (this.accessory.getService(this.hapServ.LeakSensor)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.LeakSensor))
    }

    // Add the contact sensor service if it doesn't already exist
    if (!(this.service = this.accessory.getService(this.hapServ.ContactSensor))) {
      this.service = this.accessory.addService(this.hapServ.ContactSensor)
      this.service.addCharacteristic(this.eveChar.LastActivation)
      this.service.addCharacteristic(this.eveChar.ResetTotal)
      this.service.addCharacteristic(this.eveChar.OpenDuration)
      this.service.addCharacteristic(this.eveChar.ClosedDuration)
      this.service.addCharacteristic(this.eveChar.TimesOpened)
    }

    // Obtain the current times opened value
    this.timesOpened = this.service.getCharacteristic(this.eveChar.TimesOpened).value

    // Add the set handler to the contact sensor reset total characteristic
    this.service.getCharacteristic(this.eveChar.ResetTotal).onSet(value => {
      this.timesOpened = 0
      this.service.updateCharacteristic(this.eveChar.TimesOpened, 0)
    })

    // Add the battery service if it doesn't already exist
    this.batteryService = this.accessory.getService(this.hapServ.BatteryService) ||
      this.accessory.addService(this.hapServ.BatteryService)

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('door', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        lowBattThreshold: this.lowBattThreshold
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async externalUpdate (params) {
    try {
      if (this.funcs.hasProperty(params, 'battery')) {
        const scaledBattery = Math.round(params.battery * 33.3)
        if (this.cacheBatt !== scaledBattery) {
          this.cacheBatt = scaledBattery
          this.batteryService.updateCharacteristic(
            this.hapChar.BatteryLevel,
            this.cacheBatt
          )
          this.batteryService.updateCharacteristic(
            this.hapChar.StatusLowBattery,
            this.cacheBatt < this.lowBattThreshold
          )
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log('[%s] %s [%s%].', this.name, this.lang.curBatt, this.cacheBatt)
          }
        }
      }
      if (!params.switch || params.switch === this.cacheState) {
        return
      }
      this.cacheState = params.switch
      const newState = params.switch === 'on' ? 1 : 0
      if (newState === 1) {
        this.service.updateCharacteristic(this.hapChar.ContactSensorState, 1)
        this.accessory.eveService.addEntry({ status: 1 })
        const initialTime = this.accessory.eveService.getInitialTime()
        this.service.updateCharacteristic(
          this.eveChar.LastActivation,
          Math.round(new Date().valueOf() / 1000) - initialTime
        )
        this.timesOpened++
        this.service.updateCharacteristic(this.eveChar.TimesOpened, this.timesOpened)
      } else {
        this.service.updateCharacteristic(this.hapChar.ContactSensorState, 0)
        this.accessory.eveService.addEntry({ status: 0 })
      }
      if (params.updateSource && !this.disableDeviceLogging) {
        this.log(
          '[%s] %s [%s].',
          this.name,
          this.lang.curState,
          newState === 0 ? this.lang.contactYes : this.lang.contactNo
        )
      }
      for (const [deviceId, group] of Object.entries(this.platform.simulations)) {
        if (
          group.sensorId === this.accessory.context.eweDeviceId &&
          group.type === 'garage'
        ) {
          const uuid = this.platform.api.hap.uuid.generate(deviceId + 'SWX')
          let subAccessory
          if ((subAccessory = this.platform.devicesInHB.get(uuid))) {
            const gdService = subAccessory.getService(this.hapServ.GarageDoorOpener)
            const name = subAccessory.displayName
            switch (newState) {
              case 0:
                gdService.updateCharacteristic(this.hapChar.TargetDoorState, 1)
                gdService.updateCharacteristic(this.hapChar.CurrentDoorState, 1)
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log(
                    '[%s] %s [%s].',
                    name,
                    this.lang.curState,
                    this.lang.doorClosed
                  )
                }
                break
              case 1:
                await this.funcs.sleep(Math.max(group.operationTime * 100, 2000))
                gdService.updateCharacteristic(this.hapChar.TargetDoorState, 0)
                gdService.updateCharacteristic(this.hapChar.CurrentDoorState, 0)
                if (params.updateSource && !this.disableDeviceLogging) {
                  this.log(
                    '[%s] %s [%s].',
                    name,
                    this.lang.curState,
                    this.lang.doorOpen
                  )
                }
                break
            }
          }
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
