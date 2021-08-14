/* jshint node: true,esversion: 9, -W014, -W033 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSwitchMultiInched {
  constructor (platform, accessory, devicesInHB) {
    // Set up variables from the platform
    this.devicesInHB = devicesInHB
    this.eveChar = platform.eveChar
    this.funcs = platform.funcs
    this.hapChar = platform.api.hap.Characteristic
    this.hapErr = platform.api.hap.HapStatusError
    this.hapServ = platform.api.hap.Service
    this.hapUUIDGen = platform.api.hap.uuid.generate
    this.lang = platform.lang
    this.log = platform.log
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Initially set the online flag as true (to be then updated as false if necessary)
    this.isOnline = true

    /*
    UIID 2/3/4/7/8/9/29/30/31/41/82/83/84/113/114/2256/3256/4256: multi switch, no power readings
    UIID 126: multi switch, with wattage, voltage and amp readings (DUALR3)
    */

    // Set up custom variables for this device type
    const deviceConf = platform.deviceConf[accessory.context.eweDeviceId]
    this.hideChannels = deviceConf && deviceConf.hideChannels ? deviceConf.hideChannels : undefined
    this.inUsePowerThreshold =
      deviceConf && deviceConf.inUsePowerThreshold
        ? deviceConf.inUsePowerThreshold
        : platform.consts.defaultValues.inUsePowerThreshold

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

    // If the accessory has an outlet service then remove it
    if (this.accessory.getService(this.hapServ.Outlet)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Outlet))
    }

    // Add the switch service if it doesn't already exist
    this.service =
      this.accessory.getService(this.hapServ.Switch) ||
      this.accessory.addService(this.hapServ.Switch)

    switch (this.accessory.context.eweUIID) {
      case 126:
        // Add Eve power characteristics
        this.powerReadings = true
        this.isDual = true
        if (accessory.context.switchNumber !== '0') {
          if (!this.service.testCharacteristic(this.hapChar.OutletInUse)) {
            this.service.addCharacteristic(this.hapChar.OutletInUse)
          }
          if (!this.service.testCharacteristic(this.eveChar.CurrentConsumption)) {
            this.service.addCharacteristic(this.eveChar.CurrentConsumption)
          }
          if (!this.service.testCharacteristic(this.eveChar.ElectricCurrent)) {
            this.service.addCharacteristic(this.eveChar.ElectricCurrent)
          }
          if (!this.service.testCharacteristic(this.eveChar.Voltage)) {
            this.service.addCharacteristic(this.eveChar.Voltage)
          }
        }
        break
      default:
        // Remove unused Eve characteristics
        if (this.service.testCharacteristic(this.eveChar.CurrentConsumption)) {
          this.service.removeCharacteristic(
            this.service.getCharacteristic(this.eveChar.CurrentConsumption)
          )
        }
        if (this.service.testCharacteristic(this.eveChar.ElectricCurrent)) {
          this.service.removeCharacteristic(
            this.service.getCharacteristic(this.eveChar.ElectricCurrent)
          )
        }
        if (this.service.testCharacteristic(this.eveChar.Voltage)) {
          this.service.removeCharacteristic(this.service.getCharacteristic(this.eveChar.Voltage))
        }
        break
    }

    // Add the set handler to the switch on/off characteristic
    this.service
      .getCharacteristic(this.hapChar.On)
      .onSet(async value => await this.internalStateUpdate(value))
      .updateValue(false)
    this.cacheState = 'off'

    // Add the get handlers only if the user hasn't disabled the disableNoResponse setting
    if (!platform.config.disableNoResponse) {
      this.service.getCharacteristic(this.hapChar.On).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.On).value
      })
    }

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('switch', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Set up extra features for outlets that provide power readings
    if (
      this.powerReadings &&
      accessory.context.switchNumber === '0' &&
      platform.config.mode !== 'lan'
    ) {
      // Set up an interval to get eWeLink to send power updates
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
    if (accessory.context.switchNumber === '0') {
      const opts = JSON.stringify({
        inUsePowerThreshold: this.inUsePowerThreshold,
        isInched: true,
        hideChannels: this.hideChannels,
        logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable',
        showAs: 'default'
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async internalStateUpdate (value) {
    try {
      const newValue = !this.service.getCharacteristic(this.hapChar.On).value
      const params = {
        switches: [
          {
            switch: 'on',
            outlet: this.accessory.context.switchNumber - 1
          }
        ]
      }
      this.ignoreUpdates = true
      setTimeout(() => {
        this.ignoreUpdates = false
      }, 1500)
      await this.platform.sendDeviceUpdate(this.accessory, params)
      this.accessory.eveService.addEntry({ status: newValue ? 1 : 0 })
      if (this.enableLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curState, newValue ? 'on' : 'off')
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, !value)
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
      await this.funcs.sleep(2000)
      await this.platform.sendDeviceUpdate(this.accessory, { uiActive: { outlet: 1, time: 120 } })
    } catch (err) {
      // Suppress errors here
    }
  }

  async externalUpdate (params) {
    try {
      const idToCheck = this.accessory.context.eweDeviceId + 'SW'
      for (let i = 1; i <= this.accessory.context.channelCount; i++) {
        const uuid = this.hapUUIDGen(idToCheck + i)
        if (this.devicesInHB.has(uuid)) {
          const subAccessory = this.devicesInHB.get(uuid)
          const service = subAccessory.getService(this.hapServ.Switch)
          if (params.switches && params.switches[i - 1].switch === 'on') {
            if (!this.ignoreUpdates) {
              this.ignoreUpdates = true
              setTimeout(() => {
                this.ignoreUpdates = false
              }, 1500)
              const newState = !this.service.getCharacteristic(this.hapChar.On).value
              this.service.updateCharacteristic(this.hapChar.On, newState)
              this.accessory.eveService.addEntry({ status: newState ? 1 : 0 })
              if (params.updateSource && this.enableLogging) {
                this.log('[%s] %s [%s].', this.name, this.lang.curState, newState ? 'on' : 'off')
              }
            }
          }
          if (!this.powerReadings) {
            continue
          }
          let logger = false
          let power
          let voltage
          let current
          if (this.funcs.hasProperty(params, 'actPow_0' + (i - 1))) {
            power = parseInt(params['actPow_0' + (i - 1)]) / 100
            const currentState = service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off'
            service.updateCharacteristic(this.eveChar.CurrentConsumption, power)
            service.updateCharacteristic(
              this.hapChar.OutletInUse,
              currentState === 'on' && power > this.inUsePowerThreshold
            )
            logger = true
          }
          if (this.funcs.hasProperty(params, 'voltage_0' + (i - 1))) {
            voltage = parseInt(params['voltage_0' + (i - 1)]) / 100
            service.updateCharacteristic(this.eveChar.Voltage, voltage)
            logger = true
          }
          if (this.funcs.hasProperty(params, 'current_0' + (i - 1))) {
            current = parseInt(params['current_0' + (i - 1)]) / 100
            service.updateCharacteristic(this.eveChar.ElectricCurrent, current)
            logger = true
          }
          if (params.updateSource && logger && this.enableLogging) {
            this.log(
              '[%s] %s%s%s.',
              subAccessory.displayName,
              power !== undefined ? this.lang.curPower + ' [' + power + 'W]' : '',
              voltage !== undefined ? ' ' + this.lang.curVolt + ' [' + voltage + 'V]' : '',
              current !== undefined ? ' ' + this.lang.curCurr + ' [' + current + 'A]' : ''
            )
          }
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }

  currentState () {
    const toReturn = {}
    toReturn.services = ['switch']
    toReturn.switch = {
      state: this.service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off'
    }
    return toReturn
  }
}
