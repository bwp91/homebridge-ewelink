/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceOutletMulti {
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

    // Initially set the online flag as true (to be then updated as false if necessary)
    this.isOnline = true

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

    // If the accessory has a switch service then remove it
    if (this.accessory.getService(this.hapServ.Switch)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
    }

    // Add the outlet service if it doesn't already exist
    this.service =
      this.accessory.getService(this.hapServ.Outlet) ||
      this.accessory.addService(this.hapServ.Outlet)

    // Remove any OutletInUse characteristics from previous plugin versions
    if (this.service.testCharacteristic(this.hapChar.OutletInUse)) {
      this.service.removeCharacteristic(this.service.getCharacteristic(this.hapChar.OutletInUse))
    }

    // Add the set handler to the switch/outlet on/off characteristic
    this.service
      .getCharacteristic(this.hapChar.On)
      .onSet(async value => await this.internalStateUpdate(value))

    // Add the get handlers only if the user has configured the offlineAsNoResponse setting
    if (platform.config.offlineAsNoResponse) {
      this.service.getCharacteristic(this.hapChar.On).onGet(() => {
        if (!this.isOnline) {
          throw new this.hapErr(-70402)
        }
        return this.service.getCharacteristic(this.hapChar.On).value
      })
    }

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
          params.switches.push({ switch: value ? 'on' : 'off', outlet: 2 })
          params.switches.push({ switch: value ? 'on' : 'off', outlet: 3 })
          break
        case '1':
        case '2':
        case '3':
        case '4':
          params.switches.push({
            switch: value ? 'on' : 'off',
            outlet: switchNumber - 1
          })
          break
      }
      await this.platform.sendDeviceUpdate(this.accessory, params)
      switch (switchNumber) {
        case '0':
          for (let i = 0; i <= this.accessory.context.channelCount; i++) {
            const idToCheck = this.accessory.context.eweDeviceId + 'SW' + i
            const uuid = this.hapUUIDGen(idToCheck)
            if (this.devicesInHB.has(uuid)) {
              const subAccessory = this.devicesInHB.get(uuid)
              subAccessory
                .getService(this.hapServ.Outlet)
                .updateCharacteristic(this.hapChar.On, value)
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
        case '3':
        case '4':
          for (let i = 1; i <= this.accessory.context.channelCount; i++) {
            const idToCheck = this.accessory.context.eweDeviceId + 'SW' + i
            const uuid = this.hapUUIDGen(idToCheck)
            if (this.devicesInHB.has(uuid)) {
              const subAccessory = this.devicesInHB.get(uuid)
              if (i === parseInt(switchNumber)) {
                if (value) {
                  primaryState = true
                }
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
                  subAccessory.getService(this.hapServ.Outlet).getCharacteristic(this.hapChar.On)
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

  async externalUpdate (params) {
    try {
      if (!params.switches) {
        return
      }
      const idToCheck = this.accessory.context.eweDeviceId + 'SW'
      let primaryState = false
      for (let i = 1; i <= this.accessory.context.channelCount; i++) {
        const uuid = this.hapUUIDGen(idToCheck + i)
        if (this.devicesInHB.has(uuid)) {
          if (params.switches[i - 1].switch === 'on') {
            primaryState = true
          }
          const subAccessory = this.devicesInHB.get(uuid)
          const service = subAccessory.getService(this.hapServ.Outlet)
          const currentState = service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off'
          if (params.updateSource && params.switches[i - 1].switch === currentState) {
            continue
          }
          service.updateCharacteristic(this.hapChar.On, params.switches[i - 1].switch === 'on')
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
    toReturn.services = ['outlet']
    toReturn.outlet = {
      state: this.service.getCharacteristic(this.hapChar.On).value ? 'on' : 'off'
    }
    return toReturn
  }
}
