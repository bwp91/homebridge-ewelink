/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceHumidifier {
  constructor (platform, accessory) {
    // Set up variables from the platform
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

    // Set up custom variables for this device type
    const deviceConf = platform.thDevices[accessory.context.eweDeviceId]
    const deviceConf2 = platform.simulations[accessory.context.eweDeviceId]
    this.tempOffset =
      deviceConf && deviceConf.offset ? deviceConf.offset : platform.consts.defaultValues.offset
    this.humiOffset =
      deviceConf && deviceConf.humidityOffset
        ? deviceConf.humidityOffset
        : platform.consts.defaultValues.humidityOffset
    this.disableDeviceLogging =
      (deviceConf && deviceConf.overrideDisabledLogging) || deviceConf2.overrideDisabledLogging
        ? false
        : platform.config.disableDeviceLogging

    // If the accessory has a switch service then remove it
    if (this.accessory.getService(this.hapServ.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
    }

    // Set up the accessory with default target relative humidity when added the first time
    if (!this.funcs.hasProperty(this.accessory.context, 'cacheTarget')) {
      this.accessory.context.cacheTarget = 50
    }

    // Check to make sure user has not switched from humidifier to dehumidifier
    if (this.accessory.context.cacheType !== 'dehumidifier') {
      // Remove and re-setup as a HeaterCooler
      if (this.accessory.getService(this.hapServ.HumidifierDehumidifier)) {
        this.accessory.removeService(this.accessory.getService(this.hapServ.HumidifierDehumidifier))
      }
      this.accessory.context.cacheType = 'dehumidifier'
    }

    // If the accessory has a thermostat service then remove it
    if (this.accessory.getService(this.hapServ.Thermostat)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Thermostat))
    }

    // If the accessory has a heater service then remove it
    if (this.accessory.getService(this.hapServ.HeaterCooler)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.HeaterCooler))
    }

    // If the accessory has a humidity sensor service then remove it
    if (this.accessory.getService(this.hapServ.HumiditySensor)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.HumiditySensor))
    }

    // Add the dehumidifier service if it doesn't already exist
    this.service =
      this.accessory.getService(this.hapServ.HumidifierDehumidifier) ||
      this.accessory.addService(this.hapServ.HumidifierDehumidifier)

    // Add the temperature sensor service if it doesn't already exist
    this.tempService =
      this.accessory.getService(this.hapServ.TemperatureSensor) ||
      this.accessory.addService(this.hapServ.TemperatureSensor)

    // Set the dehumidifier as the primary service
    this.service.setPrimaryService()

    // Add the set handler to the dehumidifier active characteristic
    this.service.getCharacteristic(this.hapChar.Active).onSet(async value => {
      await this.internalStateUpdate(value)
    })

    // Add options to the target state characteristic
    this.service
      .getCharacteristic(this.hapChar.TargetHumidifierDehumidifierState)
      .setProps({
        minValue: 2,
        maxValue: 2,
        validValues: [2]
      })
      .updateValue(2)

    // Add the set handler to the target relative humidity characteristic
    this.service
      .getCharacteristic(this.hapChar.RelativeHumidityDehumidifierThreshold)
      .onSet(async value => {
        await this.internalTargetHumidityUpdate(value)
      })

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('custom', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Setting this now makes the plugin send the payload to setup as a dehumidifier
    setTimeout(() => {
      this.service.setCharacteristic(
        this.hapChar.RelativeHumidityDehumidifierThreshold,
        this.accessory.context.cacheTarget
      )
    }, 3000)

    // Set up an interval to get eWeLink to send regular temperature/humidity updates
    setTimeout(() => {
      this.internalUIUpdate()
      this.intervalPoll = setInterval(() => this.internalUIUpdate(), 120000)
    }, 5000)

    // Stop the intervals on Homebridge shutdown
    platform.api.on('shutdown', () => {
      clearInterval(this.intervalPoll)
    })

    // Output the customised options to the log if in debug mode
    if (platform.config.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        humidityOffset: this.humiOffset,
        offset: this.tempOffset,
        type: deviceConf2.type
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async internalStateUpdate (value) {
    try {
      const params = { deviceType: 'humidity' }
      if (value === 0) {
        params.mainSwitch = 'off'
        params.switch = 'off'
      } else {
        params.mainSwitch = 'on'
        this.cacheHumid = this.cacheHumi > this.accessory.context.cacheTarget ? 'on' : 'off'
        params.switch = this.cacheHumid
      }
      const newValue = value === 0 ? 'off' : 'on'
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheState = newValue
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
        if (value === 1) {
          this.service.updateCharacteristic(
            this.hapChar.CurrentHumidifierDehumidifierState,
            this.cacheHumid === 'on' ? 3 : 1
          )
          this.log('[%s] %s [%s].', this.name, this.lang.curDehumid, this.cacheHumid)
        } else {
          this.service.updateCharacteristic(this.hapChar.CurrentHumidifierDehumidifierState, 0)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0)
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async internalTargetHumidityUpdate (value) {
    try {
      if (value === this.accessory.context.cacheTarget) {
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
      const params = {
        deviceType: 'humidity',
        mainSwitch: 'on',
        targets: [
          {
            targetHigh: value.toString(),
            reaction: {
              switch: 'on'
            }
          },
          {
            targetLow: value.toString(),
            reaction: {
              switch: 'off'
            }
          }
        ]
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.accessory.context.cacheTarget = value
      this.cacheState = 'on'
      if (!this.disableDeviceLogging) {
        this.log('[%s] %s [%s%].', this.name, this.lang.curTarg, value)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(
          this.hapChar.RelativeHumidityDehumidifierThreshold,
          this.accessory.context.cacheTarget
        )
      }, 2000)
      throw new this.hapErr(-70402)
    }
  }

  async internalUIUpdate () {
    try {
      const params = { uiActive: 120 }
      await this.platform.sendDeviceUpdate(this.accessory, params, false)
    } catch (err) {
      // Suppress errors here
    }
  }

  async externalUpdate (params) {
    try {
      if (params.mainSwitch) {
        const newState = params.mainSwitch
        if (this.cacheState !== newState) {
          this.cacheState = newState
          this.service.updateCharacteristic(this.hapChar.Active, this.cacheState === 'on' ? 1 : 0)
          this.accessory.eveService.addEntry({
            status: this.cacheState === 'on' ? 1 : 0
          })
          if (this.cacheState === 'off') {
            this.cacheHumid = 'off'
          }
          if (params.updateSource && !this.disableDeviceLogging && !params.switch) {
            this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
          }
        }
      }
      if (params.switch && params.switch !== this.cacheHumid) {
        this.cacheHumid = params.switch
        this.service.updateCharacteristic(
          this.hapChar.CurrentHumidifierDehumidifierState,
          this.cacheHumid === 'on' ? 3 : this.cacheState === 'on' ? 1 : 0
        )
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curDehumid, this.cacheHumid)
        }
      }
      if (
        this.funcs.hasProperty(params, 'currentTemperature') &&
        params.currentTemperature !== 'unavailable' &&
        this.cacheTempRaw !== params.currentTemperature
      ) {
        this.cacheTempRaw = params.currentTemperature
        this.cacheTemp = Number(params.currentTemperature) + this.tempOffset
        this.tempService.updateCharacteristic(this.hapChar.CurrentTemperature, this.cacheTemp)
        this.accessory.eveService.addEntry({ temp: this.cacheTemp })
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s°C].', this.name, this.lang.curTemp, this.cacheTemp)
        }
      }
      if (
        this.funcs.hasProperty(params, 'currentHumidity') &&
        params.currentHumidity !== 'unavailable' &&
        this.cacheHumiRaw !== params.currentHumidity
      ) {
        this.cacheHumiRaw = params.currentHumidity
        this.cacheHumi = Math.max(Math.min(parseInt(this.cacheHumiRaw) + this.humiOffset, 100), 0)
        this.service.updateCharacteristic(this.hapChar.CurrentRelativeHumidity, this.cacheHumi)
        this.accessory.eveService.addEntry({ humidity: this.cacheHumi })
        if (params.updateSource && !this.disableDeviceLogging) {
          this.log('[%s] %s [%s%].', this.name, this.lang.curHumi, this.cacheHumi)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
