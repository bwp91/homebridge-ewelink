/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceHeater {
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

    // Initially set the online flag as true (to be then updated as false if necessary)
    this.isOnline = true

    // Set up custom variables for this device type
    const deviceConf = platform.deviceConf[accessory.context.eweDeviceId]
    this.tempOffset =
      deviceConf && deviceConf.offset ? deviceConf.offset : platform.consts.defaultValues.offset
    this.humiOffset =
      deviceConf && deviceConf.humidityOffset
        ? deviceConf.humidityOffset
        : platform.consts.defaultValues.humidityOffset

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

    // If the accessory has a temperature sensor service then remove it
    if (this.accessory.getService(this.hapServ.TemperatureSensor)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.TemperatureSensor))
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
      this.accessory.context.cacheTarget = 50
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

    // Add the set handler to the humidifier active characteristic
    this.service
      .getCharacteristic(this.hapChar.Active)
      .onSet(async value => await this.internalStateUpdate(value))

    // Add options to the target state characteristic
    this.service
      .getCharacteristic(this.hapChar.TargetHumidifierDehumidifierState)
      .updateValue(2)
      .setProps({
        minValue: 2,
        maxValue: 2,
        validValues: [2]
      })

    // Add the set handler to the target relative humidity characteristic
    this.service
      .getCharacteristic(this.hapChar.RelativeHumidityDehumidifierThreshold)
      .updateValue(this.accessory.context.cacheTarget)
      .onSet(async value => await this.internalTargetHumidityUpdate(value))

    // Add the get handlers only if the user has configured the offlineAsNoResponse setting
    if (platform.config.offlineAsNoResponse) {
      this.tempService.getCharacteristic(this.hapChar.CurrentTemperature).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.tempService.getCharacteristic(this.hapChar.CurrentTemperature).value
      })
      this.service.getCharacteristic(this.hapChar.Active).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.Active).value
      })
      this.service.getCharacteristic(this.hapChar.CurrentHumidifierDehumidifierState).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.CurrentHumidifierDehumidifierState).value
      })
      this.service.getCharacteristic(this.hapChar.TargetHumidifierDehumidifierState).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.TargetHumidifierDehumidifierState).value
      })
      this.service.getCharacteristic(this.hapChar.CurrentRelativeHumidity).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.CurrentRelativeHumidity).value
      })
      this.service
        .getCharacteristic(this.hapChar.RelativeHumidityDehumidifierThreshold)
        .updateValue(this.accessory.context.cacheTarget)
        .onGet(() => {
          if (!this.isOnline) {
            throw new this.hapErr(-70402)
          }
          return this.service.getCharacteristic(this.hapChar.RelativeHumidityDehumidifierThreshold)
            .value
        })
    }

    // Initialise these caches now since they aren't determined by the initial externalUpdate()
    this.cacheState = this.service.getCharacteristic(this.hapChar.Active).value === 1 ? 'on' : 'off'
    this.cacheHumid =
      this.cacheState === 'on' &&
      this.service.getCharacteristic(this.hapChar.TargetHumidifierDehumidifierState).value === 3
        ? 'on'
        : 'off'

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('custom', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Set up an interval to get eWeLink to send regular temperature/humidity updates
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
      humidityOffset: this.humiOffset,
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable',
      offset: this.tempOffset,
      showAs: 'dehumidifier'
    })
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
  }

  async internalStateUpdate (value) {
    try {
      const params = { deviceType: 'normal' }
      let newState
      let newHumid
      if (value === 0) {
        params.mainSwitch = 'off'
        params.switch = 'off'
        newState = 'off'
        newHumid = 'off'
      } else {
        if (this.cacheHumi > this.accessory.context.cacheTarget) {
          params.mainSwitch = 'on'
          params.switch = 'on'
          newState = 'on'
          newHumid = 'on'
        } else {
          params.mainSwitch = 'off'
          params.switch = 'off'
          newState = 'on'
          newHumid = 'off'
        }
      }

      // Only send the update if either:
      // * The new value (state) is OFF and the cacheHumid was ON
      // * The new value (state) is ON and newHumid is 'on'
      if ((value === 0 && this.cacheHumid === 'on') || (value === 1 && newHumid === 'on')) {
        await this.platform.sendDeviceUpdate(this.accessory, params)
      }
      if (newState !== this.cacheState) {
        this.cacheState = newState
        if (this.enableLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState)
        }
      }
      if (newHumid !== this.cacheHumid) {
        this.cacheHumid = newHumid
        if (this.enableLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curDehumid, this.cacheHumid)
        }
      }
      this.service.updateCharacteristic(
        this.hapChar.CurrentHumidifierDehumidifierState,
        value === 1 ? (this.cacheHumid === 'on' ? 3 : 1) : 0
      )
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
      this.accessory.context.cacheTarget = value
      if (this.enableLogging) {
        this.log('[%s] %s [%s%].', this.name, this.lang.curTarg, value)
      }
      if (this.cacheState === 'off') {
        return
      }
      const params = { deviceType: 'normal' }
      let newHumid
      if (this.cacheHumi > value) {
        params.mainSwitch = 'on'
        params.switch = 'on'
        newHumid = 'on'
      } else {
        params.mainSwitch = 'off'
        params.switch = 'off'
        newHumid = 'off'
      }
      if (newHumid === this.cacheHumid) {
        return
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheHumid = newHumid
      if (this.enableLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curDehumid, this.cacheHumid)
      }
      this.service.updateCharacteristic(
        this.hapChar.CurrentHumidifierDehumidifierState,
        this.cacheHumid === 'on' ? 3 : 1
      )
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

  async internalCurrentHumidityUpdate () {
    try {
      if (this.cacheState === 'off') {
        return
      }
      const params = { deviceType: 'normal' }
      let newHumid
      if (this.cacheHumi > this.accessory.context.cacheTarget) {
        params.mainSwitch = 'on'
        params.switch = 'on'
        newHumid = 'on'
      } else {
        params.mainSwitch = 'off'
        params.switch = 'off'
        newHumid = 'off'
      }
      if (newHumid === this.cacheHumid) {
        return
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.cacheHumid = newHumid
      if (this.enableLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curDehumid, this.cacheHumid)
      }
      this.service.updateCharacteristic(
        this.hapChar.CurrentHumidifierDehumidifierState,
        this.cacheHumid === 'on' ? 3 : 1
      )
    } catch (err) {
      // Suppress errors here
    }
  }

  async internalUIUpdate () {
    try {
      // Skip polling if device isn't online
      if (!this.isOnline) {
        return
      }

      // Send the params to request the updates
      await this.platform.sendDeviceUpdate(this.accessory, { uiActive: 120 })
    } catch (err) {
      // Suppress errors here
    }
  }

  async externalUpdate (params) {
    try {
      if (
        this.funcs.hasProperty(params, 'currentTemperature') &&
        params.currentTemperature !== 'unavailable' &&
        this.cacheTempRaw !== params.currentTemperature
      ) {
        this.cacheTempRaw = params.currentTemperature
        this.cacheTemp = Number(params.currentTemperature) + this.tempOffset
        this.tempService.updateCharacteristic(this.hapChar.CurrentTemperature, this.cacheTemp)
        this.accessory.eveService.addEntry({ temp: this.cacheTemp })
        if (params.updateSource && this.enableLogging) {
          this.log('[%s] %s [%s%].', this.name, this.lang.curTemp, this.cacheTemp)
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
        if (params.updateSource && this.enableLogging) {
          this.log('[%s] %s [%s%].', this.name, this.lang.curHumi, this.cacheHumi)
        }
        await this.internalCurrentHumidityUpdate()
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
