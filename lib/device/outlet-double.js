/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceOutletDouble {
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
    const deviceConf = platform.multiDevices[deviceId]
    this.hideChannels = deviceConf && deviceConf.hideChannels
      ? deviceConf.hideChannels
      : undefined
    this.inUsePowerThreshold = deviceConf && deviceConf.inUsePowerThreshold
      ? deviceConf.inUsePowerThreshold
      : platform.consts.defaultValues.inUsePowerThreshold
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    // If the accessory has a switch service then remove it
    if (this.accessory.getService(this.hapServ.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
    }

    // Add the outlet service if it doesn't already exist
    if (!(this.service = this.accessory.getService(this.hapServ.Outlet))) {
      this.service = this.accessory.addService(this.hapServ.Outlet)
      this.service.addCharacteristic(this.eveChar.Voltage)
      this.service.addCharacteristic(this.eveChar.CurrentConsumption)
      this.service.addCharacteristic(this.eveChar.ElectricCurrent)
    }

    // Add the set handler to the switch/outlet on/off characteristic
    this.service.getCharacteristic(this.hapChar.On).onSet(async value => {
      await this.internalStateUpdate(value)
    })

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('energy', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    setTimeout(() => {
      this.internalUIUpdate()
      this.intervalPoll = setInterval(() => this.internalUIUpdate(), 60000)
    }, 5000)

    // Stop the intervals on Homebridge shutdown
    platform.api.on('shutdown', () => {
      clearInterval(this.intervalPoll)
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        hideChannels: this.hideChannels,
        inUsePowerThreshold: this.inUsePowerThreshold,
        showAsOutlet: true
      })
      this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)
    }
  }

  async internalStateUpdate (value) {
    try {
      let masterState = 'off'
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
          params.switches.push({ switch: value ? 'on' : 'off', outlet: switchNumber - 1 })
          break
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      switch (switchNumber) {
        case '0':
          for (let i = 0; i <= 2; i++) {
            const idToCheck = this.accessory.context.eweDeviceId + 'SW' + i
            const uuid = this.platform.api.hap.uuid.generate(idToCheck)
            let subAccessory
            if ((subAccessory = this.platform.devicesInHB.get(uuid))) {
              subAccessory.getService(this.hapServ.Outlet).updateCharacteristic(
                this.hapChar.On,
                value
              )
              subAccessory.getService(this.hapServ.Outlet).updateCharacteristic(
                this.hapChar.OutletInUse,
                value
              )
              if (i > 0 && !this.disableDeviceLogging) {
                this.log(
                  '[%s] %s [%s].',
                  subAccessory.displayName,
                  this.lang.curState,
                  value ? 'on' : 'off'
                )
              }
            }
          }
          break
        case '1':
        case '2':
          for (let i = 1; i <= this.accessory.context.channelCount; i++) {
            const idToCheck = this.accessory.context.eweDeviceId + 'SW' + i
            const uuid = this.platform.api.hap.uuid.generate(idToCheck)
            let subAccessory
            if ((subAccessory = this.platform.devicesInHB.get(uuid))) {
              if (
                subAccessory.getService(this.hapServ.Outlet)
                  .getCharacteristic(this.hapChar.On).value
              ) {
                masterState = 'on'
              }
              if (i === parseInt(switchNumber)) {
                subAccessory.getService(this.hapServ.Outlet).updateCharacteristic(
                  this.hapChar.OutletInUse,
                  value
                )
                if (i > 0 && !this.disableDeviceLogging) {
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
          if (!this.platform.hideMasters.includes(this.accessory.context.eweDeviceId)) {
            const idToCheck = this.accessory.context.eweDeviceId + 'SW0'
            const uuid = this.platform.api.hap.uuid.generate(idToCheck)
            const subAccessory = this.platform.devicesInHB.get(uuid)
            subAccessory.getService(this.hapServ.Outlet).updateCharacteristic(
              this.hapChar.On,
              masterState === 'on'
            )
          }
          break
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, !value)
      }, 5000)
      throw new this.platform.api.hap.HapStatusError(-70402)
    }
  }

  async internalUIUpdate () {
    try {
      const params = { uiActive: 60 }
      await this.platform.sendDeviceUpdate(this.accessory, params, true)
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      const idToCheck = this.accessory.context.eweDeviceId + 'SW'
      let primaryState = false
      for (let i = 1; i <= 2; i++) {
        const uuid = this.platform.api.hap.uuid.generate(idToCheck + i)
        if (this.platform.devicesInHB.has(uuid)) {
          const subAccessory = this.platform.devicesInHB.get(uuid)
          const service = subAccessory.getService(this.hapServ.Outlet)
          if (params.switches) {
            const currentState = service.getCharacteristic(this.hapChar.On).value
              ? 'on'
              : 'off'
            if (!params.updateSource || params.switches[i - 1].switch !== currentState) {
              service.updateCharacteristic(
                this.hapChar.On,
                params.switches[i - 1].switch === 'on'
              )
              if (params.updateSource && !this.disableDeviceLogging) {
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
            power = parseFloat(params['actPow_0' + (i - 1)]) / 100
            service.updateCharacteristic(
              this.hapChar.OutletInUse,
              power > this.inUsePowerThreshold
            )
            if (!primaryState && power > this.inUsePowerThreshold) {
              primaryState = true
            }
            service.updateCharacteristic(this.eveChar.CurrentConsumption, power)
            const isOn = service.getCharacteristic(this.hapChar.On).value
            subAccessory.eveService.addEntry({ power: isOn ? power : 0 })
            logger = true
          }
          if (this.funcs.hasProperty(params, 'voltage_0' + (i - 1))) {
            voltage = parseFloat(params['voltage_0' + (i - 1)]) / 100
            service.updateCharacteristic(this.eveChar.Voltage, voltage)
            logger = true
          }
          if (this.funcs.hasProperty(params, 'current_0' + (i - 1))) {
            current = parseFloat(params['current_0' + (i - 1)]) / 100
            this.service.updateCharacteristic(this.eveChar.ElectricCurrent, current)
            logger = true
          }
          if (params.updateSource && logger && !this.disableDeviceLogging) {
            this.log(
              '[%s] %s%s%s.',
              this.name,
              power !== undefined
                ? ' ' + this.lang.curPower + ' [' + power + 'W]'
                : '',
              voltage !== undefined
                ? ' ' + this.lang.curVolt + ' [' + voltage + 'V]'
                : '',
              current !== undefined
                ? ' ' + this.lang.curCurr + ' [' + current + 'A]'
                : ''
            )
          }
        }
      }
      if (!this.platform.hideMasters.includes(this.accessory.context.eweDeviceId)) {
        this.service.updateCharacteristic(this.hapChar.On, primaryState)
        this.service.updateCharacteristic(this.hapChar.OutletInUse, primaryState)
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
