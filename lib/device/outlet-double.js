/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceOutletDouble {
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

    // Set up custom variables for this device type
    const deviceConf = platform.multiDevices[accessory.context.eweDeviceId]
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

    // If the accessory has a switch service then remove it
    if (this.accessory.getService(this.hapServ.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
    }

    // Add the outlet service if it doesn't already exist
    if (!(this.service = this.accessory.getService(this.hapServ.Outlet))) {
      this.service = this.accessory.addService(this.hapServ.Outlet)
      if (accessory.context.switchNumber !== '0') {
        this.service.addCharacteristic(this.eveChar.Voltage)
        this.service.addCharacteristic(this.eveChar.CurrentConsumption)
        this.service.addCharacteristic(this.eveChar.ElectricCurrent)
        this.service.addCharacteristic(this.eveChar.TotalConsumption)
      }
    }

    // Add the set handler to the switch/outlet on/off characteristic
    this.service.getCharacteristic(this.hapChar.On).onSet(async value => {
      await this.internalStateUpdate(value)
    })

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('energy', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Set up an interval to get eWeLink to send regular power info updates
    // if (platform.config.mode !== 'lan') {
      setTimeout(() => {
        this.internalUIUpdate()
        this.intervalPoll = setInterval(() => this.internalUIUpdate(), 120000)
      }, 5000)

      // Stop the intervals on Homebridge shutdown
      platform.api.on('shutdown', () => {
        clearInterval(this.intervalPoll)
      })
    // }

    if (accessory.context.switchNumber === '0') {
      if (this.service.testCharacteristic(this.hapChar.OutletInUse)) {
        this.service.removeCharacteristic(this.service.getCharacteristic(this.hapChar.OutletInUse))
      }
      if (this.service.testCharacteristic(this.eveChar.Voltage)) {
        this.service.removeCharacteristic(this.service.getCharacteristic(this.eveChar.Voltage))
        this.service.removeCharacteristic(
          this.service.getCharacteristic(this.eveChar.CurrentConsumption)
        )
        this.service.removeCharacteristic(
          this.service.getCharacteristic(this.eveChar.ElectricCurrent)
        )
        this.service.removeCharacteristic(
          this.service.getCharacteristic(this.eveChar.TotalConsumption)
        )
      }
    }

    // Output the customised options to the log
    if (accessory.context.switchNumber === '0') {
      const opts = JSON.stringify({
        hideChannels: this.hideChannels,
        inUsePowerThreshold: this.inUsePowerThreshold,
        logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable'
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async internalStateUpdate (value) {
    try {
      let primaryState = false
      const params = {
        switches: []
      }
      const switchNumber = this.accessory.context.switchNumber
      switch (switchNumber) {
        case '0':
          params.switches.push({ switch: value ? 'on' : 'off', outlet: 0 })
          params.switches.push({ switch: value ? 'on' : 'off', outlet: 1 })
          break
        case '1':
        case '2':
          params.switches.push({
            switch: value ? 'on' : 'off',
            outlet: switchNumber - 1
          })
          break
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      switch (switchNumber) {
        case '0':
          for (let i = 0; i <= 2; i++) {
            const idToCheck = this.accessory.context.eweDeviceId + 'SW' + i
            const uuid = this.hapUUIDGen(idToCheck)
            if (this.devicesInHB.has(uuid)) {
              const subAccessory = this.devicesInHB.get(uuid)
              const service = subAccessory.getService(this.hapServ.Outlet)
              service.updateCharacteristic(this.hapChar.On, value)
              if (i > 0) {
                if (!value) {
                  service.updateCharacteristic(this.hapChar.OutletInUse, false)
                  service.updateCharacteristic(this.eveChar.CurrentConsumption, 0)
                  subAccessory.eveService.addEntry({ power: 0 })
                }
                if (this.enableLogging) {
                  this.log(
                    '[%s] %s [%s].',
                    subAccessory.displayName,
                    this.lang.curState,
                    value ? 'on' : 'off'
                  )
                }
              }
            }
          }
          break
        case '1':
        case '2':
          for (let i = 1; i <= 2; i++) {
            const idToCheck = this.accessory.context.eweDeviceId + 'SW' + i
            const uuid = this.hapUUIDGen(idToCheck)
            if (this.devicesInHB.has(uuid)) {
              const subAccessory = this.devicesInHB.get(uuid)
              const service = subAccessory.getService(this.hapServ.Outlet)
              if (i === parseInt(switchNumber)) {
                if (value) {
                  primaryState = true
                }
                if (i > 0) {
                  if (!value) {
                    service.updateCharacteristic(this.hapChar.OutletInUse, false)
                    service.updateCharacteristic(this.eveChar.CurrentConsumption, 0)
                    subAccessory.eveService.addEntry({ power: 0 })
                  }
                  if (this.enableLogging) {
                    this.log(
                      '[%s] %s [%s].',
                      subAccessory.displayName,
                      this.lang.curState,
                      value ? 'on' : 'off'
                    )
                  }
                }
              } else {
                if (service.getCharacteristic(this.hapChar.On).value) {
                  primaryState = true
                }
              }
            }
          }
          if (!this.platform.hideMasters.includes(this.accessory.context.eweDeviceId)) {
            const idToCheck = this.accessory.context.eweDeviceId + 'SW0'
            const uuid = this.hapUUIDGen(idToCheck)
            const priAccessory = this.devicesInHB.get(uuid)
            priAccessory
              .getService(this.hapServ.Outlet)
              .updateCharacteristic(this.hapChar.On, primaryState)
          }
          break
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
      const params = { uiActive: 120 }
      await this.platform.sendDeviceUpdate(this.accessory, params)
    } catch (err) {
      // Suppress errors here
    }
  }

  async externalUpdate (params) {
    try {
      const idToCheck = this.accessory.context.eweDeviceId + 'SW'
      let primaryState = false
      for (let i = 1; i <= 2; i++) {
        const uuid = this.hapUUIDGen(idToCheck + i)
        if (this.devicesInHB.has(uuid)) {
          const subAccessory = this.devicesInHB.get(uuid)
          const service = subAccessory.getService(this.hapServ.Outlet)
          if (params.switches) {
            if (params.switches[i - 1].switch === 'on') {
              primaryState = true
            }
            const currentState = service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off'
            if (!params.updateSource || params.switches[i - 1].switch !== currentState) {
              service.updateCharacteristic(this.hapChar.On, params.switches[i - 1].switch === 'on')
              if (params.switches[i - 1].switch === 'off') {
                service.updateCharacteristic(this.hapChar.OutletInUse, false)
                service.updateCharacteristic(this.eveChar.CurrentConsumption, 0)
                subAccessory.eveService.addEntry({ power: 0 })
              }
              if (params.updateSource && this.enableLogging) {
                this.log(
                  '[%s] %s [%s].',
                  subAccessory.displayName,
                  this.lang.curState,
                  params.switches[i - 1].switch
                )
              }
            }
          }
          let logger = false
          let power
          let voltage
          let current
          if (this.funcs.hasProperty(params, 'actPow_0' + (i - 1))) {
            const isOn = service.getCharacteristic(this.hapChar.On).value
            power = parseInt(params['actPow_0' + (i - 1)]) / 100
            service.updateCharacteristic(
              this.hapChar.OutletInUse,
              isOn && power > this.inUsePowerThreshold
            )
            if (!primaryState && power > this.inUsePowerThreshold) {
              primaryState = true
            }
            service.updateCharacteristic(this.eveChar.CurrentConsumption, power)
            subAccessory.eveService.addEntry({ power: isOn ? power : 0 })
            logger = true
          }
          if (this.funcs.hasProperty(params, 'voltage_0' + (i - 1))) {
            voltage = parseInt(params['voltage_0' + (i - 1)]) / 100
            service.updateCharacteristic(this.eveChar.Voltage, voltage)
            logger = true
          }
          if (this.funcs.hasProperty(params, 'current_0' + (i - 1))) {
            current = parseInt(params['current_0' + (i - 1)]) / 100
            this.service.updateCharacteristic(this.eveChar.ElectricCurrent, current)
            logger = true
          }
          if (params.updateSource && logger && this.enableLogging) {
            this.log(
              '[%s] %s%s%s.',
              this.name,
              power !== undefined ? ' ' + this.lang.curPower + ' [' + power + 'W]' : '',
              voltage !== undefined ? ' ' + this.lang.curVolt + ' [' + voltage + 'V]' : '',
              current !== undefined ? ' ' + this.lang.curCurr + ' [' + current + 'A]' : ''
            )
          }
        }
      }
      if (
        !this.platform.hideMasters.includes(this.accessory.context.eweDeviceId) &&
        params.switches
      ) {
        this.service.updateCharacteristic(this.hapChar.On, primaryState)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  currentState () {
    const toReturn = {}
    toReturn.services = ['outlet']
    toReturn.outlet = {
      state: this.service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off'
    }
    return toReturn
  }
}
