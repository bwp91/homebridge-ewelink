/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSwitchDouble {
  constructor (platform, accessory, devicesInHB) {
    // Set up variables from the platform
    this.devicesInHB = devicesInHB
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

    // Add the set handler to the switch/outlet on/off characteristic
    this.service.getCharacteristic(this.hapChar.On).onSet(async value => {
      await this.internalStateUpdate(value)
    })

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('switch', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log
    if (accessory.context.switchNumber === '0') {
      const opts = JSON.stringify({
        hideChannels: this.hideChannels,
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
              subAccessory
                .getService(this.hapServ.Switch)
                .updateCharacteristic(this.hapChar.On, value)
              subAccessory.eveService.addEntry({ status: value ? 1 : 0 })
              if (i > 0 && this.enableLogging) {
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
          for (let i = 1; i <= 2; i++) {
            const idToCheck = this.accessory.context.eweDeviceId + 'SW' + i
            const uuid = this.hapUUIDGen(idToCheck)
            if (this.devicesInHB.has(uuid)) {
              const subAccessory = this.devicesInHB.get(uuid)
              if (i === parseInt(switchNumber)) {
                if (value) {
                  primaryState = true
                }
                subAccessory.eveService.addEntry({ status: value ? 1 : 0 })
                if (i > 0 && this.enableLogging) {
                  this.log(
                    '[%s] %s [%s].',
                    subAccessory.displayName,
                    this.lang.curState,
                    value ? 'on' : 'off'
                  )
                }
              } else {
                if (
                  subAccessory.getService(this.hapServ.Switch).getCharacteristic(this.hapChar.On)
                    .value
                ) {
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
              .getService(this.hapServ.Switch)
              .updateCharacteristic(this.hapChar.On, primaryState)
            priAccessory.eveService.addEntry({ status: primaryState ? 1 : 0 })
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

  async externalUpdate (params) {
    try {
      if (!params.switches) {
        return
      }
      const idToCheck = this.accessory.context.eweDeviceId + 'SW'
      let primaryState = false
      for (let i = 1; i <= 2; i++) {
        const uuid = this.hapUUIDGen(idToCheck + i)
        if (this.devicesInHB.has(uuid)) {
          if (params.switches[i - 1].switch === 'on') {
            primaryState = true
          }
          const subAccessory = this.devicesInHB.get(uuid)
          const service = subAccessory.getService(this.hapServ.Switch)
          const currentState = service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off'
          if (params.updateSource && params.switches[i - 1].switch === currentState) {
            continue
          }
          service.updateCharacteristic(this.hapChar.On, params.switches[i - 1].switch === 'on')
          subAccessory.eveService.addEntry({
            status: params.switches[i - 1].switch === 'on' ? 1 : 0
          })
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
      if (!this.platform.hideMasters.includes(this.accessory.context.eweDeviceId)) {
        this.service.updateCharacteristic(this.hapChar.On, primaryState)
        this.accessory.eveService.addEntry({ status: primaryState ? 1 : 0 })
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
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
