/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSwitchMulti {
  constructor (platform, accessory) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
    this.funcs = platform.funcs
    this.hapServ = platform.api.hap.Service
    this.hapChar = platform.api.hap.Characteristic
    this.log = platform.log
    this.messages = platform.messages
    this.platform = platform

    // Set up variables from the accessory
    this.name = accessory.displayName
    this.accessory = accessory

    // Set up custom variables for this device type
    const deviceId = this.accessory.context.eweDeviceId
    const deviceConf = platform.multiDevices[deviceId]
    this.showAsOutlet = deviceConf && deviceConf.showAsOutlet
    this.hideChannels = deviceConf && deviceConf.hideChannels
      ? deviceConf.hideChannels
      : undefined
    this.disableDeviceLogging = deviceConf && deviceConf.overrideDisabledLogging
      ? false
      : platform.config.disableDeviceLogging

    if (this.showAsOutlet) {
      // If the accessory has a switch service then remove it
      if (this.accessory.getService(this.hapServ.Switch)) {
        this.accessory.removeService(this.accessory.getService(this.hapServ.Switch))
      }

      // Add the outlet service if it doesn't already exist
      this.service = this.accessory.getService(this.hapServ.Outlet) ||
        this.accessory.addService(this.hapServ.Outlet)
    } else {
      // If the accessory has an outlet service then remove it
      if (this.accessory.getService(this.hapServ.Outlet)) {
        this.accessory.removeService(this.accessory.getService(this.hapServ.Outlet))
      }

      // Add the switch service if it doesn't already exist
      this.service = this.accessory.getService(this.hapServ.Switch) ||
        this.accessory.addService(this.hapServ.Switch)
    }

    // Add the set handler to the switch/outlet on/off characteristic
    this.service.getCharacteristic(this.hapChar.On).onSet(async value => {
      await this.internalUpdate(value)
    })

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new this.platform.eveService('switch', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log if in debug mode
    if (this.debug) {
      const opts = JSON.stringify({
        disableDeviceLogging: this.disableDeviceLogging,
        hideChannels: this.hideChannels,
        showAsOutlet: this.showAsOutlet
      })
      this.log('[%s] %s %s.', this.name, this.messages.devInitOpts, opts)
    }
  }

  async internalUpdate (value) {
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
          for (let i = 0; i <= this.accessory.context.channelCount; i++) {
            const idToCheck = this.accessory.context.eweDeviceId + 'SW' + i
            const uuid = this.platform.api.hap.uuid.generate(idToCheck)
            let subAccessory
            if ((subAccessory = this.platform.devicesInHB.get(uuid))) {
              if (this.showAsOutlet) {
                subAccessory.getService(this.hapServ.Outlet).updateCharacteristic(
                  this.hapChar.On,
                  value
                )
                subAccessory.getService(this.hapServ.Outlet).updateCharacteristic(
                  this.hapChar.OutletInUse,
                  value
                )
              } else {
                subAccessory.getService(this.hapServ.Switch).updateCharacteristic(
                  this.hapChar.On,
                  value
                )
              }
              subAccessory.eveService.addEntry({ status: value ? 1 : 0 })
              if (i > 0 && !this.disableDeviceLogging) {
                const name = subAccessory.displayName
                this.log('[%s] current state [%s].', name, value ? 'on' : 'off')
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
              const service = this.showAsOutlet
                ? this.hapServ.Outlet
                : this.hapServ.Switch
              if (
                subAccessory.getService(service).getCharacteristic(this.hapChar.On).value
              ) {
                masterState = 'on'
              }
              if (i === parseInt(switchNumber)) {
                subAccessory.eveService.addEntry({ status: value ? 1 : 0 })
                if (this.showAsOutlet) {
                  subAccessory.getService(this.hapServ.Outlet).updateCharacteristic(
                    this.hapChar.OutletInUse,
                    value
                  )
                }
                if (i > 0 && !this.disableDeviceLogging) {
                  this.log(
                    '[%s] current state [%s].',
                    subAccessory.displayName,
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
            if (this.showAsOutlet) {
              subAccessory.getService(this.hapServ.Outlet).updateCharacteristic(
                this.hapChar.On,
                masterState === 'on'
              )
              subAccessory.getService(this.hapServ.Outlet).updateCharacteristic(
                this.hapChar.OutletInUse,
                masterState === 'on'
              )
            } else {
              subAccessory.getService(this.hapServ.Switch).updateCharacteristic(
                this.hapChar.On,
                masterState === 'on'
              )
            }
            subAccessory.eveService.addEntry({ status: masterState === 'on' ? 1 : 0 })
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

  async externalUpdate (params) {
    try {
      if (!params.switches) {
        return
      }
      const idToCheck = this.accessory.context.eweDeviceId + 'SW'
      let primaryState = false
      for (let i = 1; i <= this.accessory.context.channelCount; i++) {
        if (params.switches[i - 1].switch === 'on') {
          primaryState = true
        }
        const uuid = this.platform.api.hap.uuid.generate(idToCheck + i)
        if (this.platform.devicesInHB.has(uuid)) {
          const subAccessory = this.platform.devicesInHB.get(uuid)
          const servToUse = this.showAsOutlet ? this.hapServ.Outlet : this.hapServ.Switch
          const service = subAccessory.getService(servToUse)
          const currentState = service.getCharacteristic(this.hapChar.On).value
            ? 'on'
            : 'off'
          if (params.updateSource && params.switches[i - 1].switch === currentState) {
            continue
          }
          if (this.showAsOutlet) {
            subAccessory.getService(this.hapServ.Outlet).updateCharacteristic(
              this.hapChar.On,
              params.switches[i - 1].switch === 'on'
            )
            subAccessory.getService(this.hapServ.Outlet).updateCharacteristic(
              this.hapChar.OutletInUse,
              params.switches[i - 1].switch === 'on'
            )
          } else {
            subAccessory.getService(this.hapServ.Switch).updateCharacteristic(
              this.hapChar.On,
              params.switches[i - 1].switch === 'on'
            )
          }
          subAccessory.eveService.addEntry({
            status: params.switches[i - 1].switch === 'on' ? 1 : 0
          })
          if (params.updateSource && !this.disableDeviceLogging) {
            this.log(
              '[%s] current state [%s].',
              subAccessory.displayName,
              params.switches[i - 1].switch
            )
          }
        }
      }
      if (!this.platform.hideMasters.includes(this.accessory.context.eweDeviceId)) {
        this.service.updateCharacteristic(this.hapChar.On, primaryState)
        if (this.showAsOutlet) {
          this.service.updateCharacteristic(this.hapChar.OutletInUse, primaryState)
        }
        this.accessory.eveService.addEntry({ status: primaryState ? 1 : 0 })
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
