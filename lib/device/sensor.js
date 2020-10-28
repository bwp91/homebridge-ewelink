/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const corrInterval = require('correcting-interval')
const fakegato = require('fakegato-history')
const helpers = require('./../helpers')
module.exports = class deviceSensor {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    this.EveHistoryService = fakegato(platform.api)
    this.lowBattThreshold = parseInt(this.platform.config.lowBattThreshold)
    this.lowBattThreshold = isNaN(this.lowBattThreshold)
      ? helpers.defaults.lowBattThreshold
      : this.lowBattThreshold < 5
        ? helpers.defaults.lowBattThreshold
        : this.lowBattThreshold
    const contactService = accessory.getService(this.Service.ContactSensor) || accessory.addService(this.Service.ContactSensor)
    if (!accessory.getService(this.Service.BatteryService)) accessory.addService(this.Service.BatteryService)
    if (!this.platform.config.disableEveLogging) {
      accessory.log = this.platform.log
      accessory.eveLogger = new this.EveHistoryService('door', accessory, {
        storage: 'fs',
        path: this.platform.eveLogPath
      })
    }
    this.accessory = accessory
  }

  async externalUpdate (params) {
    try {
      if (helpers.hasProperty(params, 'battery')) {
        const batteryService =
            this.accessory.getService(this.Service.BatteryService) || this.accessory.addService(this.Service.BatteryService)
        const scaledBattery = Math.round(params.battery * 33.3)
        batteryService.updateCharacteristic(this.Characteristic.BatteryLevel, scaledBattery)
        batteryService.updateCharacteristic(
          this.Characteristic.StatusLowBattery,
          scaledBattery < this.lowBattThreshold
        )
      }
      if (!helpers.hasProperty(params, 'switch')) return
      const newState = params.switch === 'on' ? 1 : 0
      let oAccessory = false
      const contactService = this.accessory.getService(this.Service.ContactSensor)
      contactService.updateCharacteristic(this.Characteristic.ContactSensorState, newState)
      if (!this.platform.config.disableEveLogging) {
        const eveLog = {
          time: Math.round(new Date().valueOf() / 1000),
          status: newState
        }
        this.accessory.eveLogger.addEntry(eveLog)
      }
      this.platform.cusG.forEach(async group => {
        if (group.sensorId === this.accessory.context.eweDeviceId && group.type === 'garage') {
          if ((oAccessory = this.platform.devicesInHB.get(group.deviceId + 'SWX'))) {
            switch (newState) {
              case 0:
                oAccessory
                  .getService(this.Service.GarageDoorOpener)
                  .updateCharacteristic(this.Characteristic.TargetDoorState, 1)
                  .updateCharacteristic(this.Characteristic.CurrentDoorState, 1)
                break
              case 1:
                await helpers.sleep(Math.max(group.operationTime * 100, 1000))
                oAccessory
                  .getService(this.Service.GarageDoorOpener)
                  .updateCharacteristic(this.Characteristic.TargetDoorState, 0)
                  .updateCharacteristic(this.Characteristic.CurrentDoorState, 0)
                break
            }
          }
        }
      })
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
