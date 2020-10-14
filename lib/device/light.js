/* jshint -W014, -W033, esversion: 9 */
'use strict'
let Characteristic, Service
const cns = require('./../constants')
const convert = require('color-convert')
const utils = require('./../utils')
module.exports = class deviceLight {
  constructor (platform, accessory) {
    this.platform = platform
    Service = platform.api.hap.Service
    Characteristic = platform.api.hap.Characteristic
    const lightService = accessory.getService(Service.Lightbulb) || accessory.addService(Service.Lightbulb)
    lightService
      .getCharacteristic(Characteristic.On)
      .on('set', (value, callback) => this.internalUpdate(accessory, 'onoff', value, callback))
    if (cns.devicesBrightable.includes(accessory.context.eweUIID)) {
      lightService.getCharacteristic(Characteristic.Brightness).on('set', (value, callback) => {
        if (value > 0) {
          if (!lightService.getCharacteristic(Characteristic.On).value) {
            this.internalUpdate(accessory, 'onoff', true, function () {})
          }
          this.internalUpdate(accessory, 'brightness', value, callback)
        } else {
          this.internalUpdate(accessory, 'onoff', false, callback)
        }
      })
    } else if (cns.devicesColourable.includes(accessory.context.eweUIID)) {
      lightService.getCharacteristic(Characteristic.Brightness).on('set', (value, callback) => {
        if (value > 0) {
          if (!lightService.getCharacteristic(Characteristic.On).value) {
            this.internalUpdate(accessory, 'onoff', true, function () {})
          }
          this.internalUpdate(accessory, 'c_brightness', value, callback)
        } else {
          this.internalUpdate(accessory, 'onoff', false, callback)
        }
      })
      lightService
        .getCharacteristic(Characteristic.Hue)
        .on('set', (value, callback) => this.internalUpdate(accessory, 'c_hue', value, callback))
      lightService.getCharacteristic(Characteristic.Saturation).on('set', (value, callback) => callback())
    }
  }

  async internalUpdate (accessory, type, value, callback) {
    callback()
    try {
      let oAccessory
      let newRGB
      let params = {}
      const lightService = accessory.getService(Service.Lightbulb)
      switch (type) {
        case 'onoff':
          switch (accessory.context.switchNumber) {
            case 'X':
              if (accessory.context.eweUIID === 22) {
              //* ** B1 ***\\
                params.state = value ? 'on' : 'off'
              } else {
                params.switch = value ? 'on' : 'off'
              }
              break
            case '0':
              params.switches = cns.defaultMultiSwitchOff
              params.switches[0].switch = value ? 'on' : 'off'
              params.switches[1].switch = value ? 'on' : 'off'
              params.switches[2].switch = value ? 'on' : 'off'
              params.switches[3].switch = value ? 'on' : 'off'
              break
            case '1':
            case '2':
            case '3':
            case '4':
              params.switches = cns.defaultMultiSwitchOff
              for (let i = 1; i <= 4; i++) {
                if ((oAccessory = this.platform.devicesInHB.get(accessory.context.eweDeviceId + 'SW' + i))) {
                  if (i === parseInt(accessory.context.switchNumber)) {
                    params.switches[i - 1].switch = value ? 'on' : 'off'
                  } else {
                    params.switches[i - 1].switch = oAccessory.context.cacheOn ? 'on' : 'off'
                  }
                } else {
                  params.switches[i - 1].switch = 'off'
                }
              }
              break
          }
          await this.platform.sendDeviceUpdate(accessory, params)
          switch (accessory.context.switchNumber) {
            case 'X':
              lightService.updateCharacteristic(Characteristic.On, value)
              break
            case '0':
              for (let i = 0; i <= 4; i++) {
                if ((oAccessory = this.platform.devicesInHB.get(accessory.context.eweDeviceId + 'SW' + i))) {
                  oAccessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.On, value)
                }
              }
              break
            case '1':
            case '2':
            case '3':
            case '4': {
              lightService.updateCharacteristic(Characteristic.On, value)
              let masterState = 'off'
              for (let i = 1; i <= 4; i++) {
                if ((oAccessory = this.platform.devicesInHB.get(accessory.context.eweDeviceId + 'SW' + i))) {
                  if (oAccessory.getService(Service.Lightbulb).getCharacteristic(Characteristic.On).value) {
                    masterState = 'on'
                  }
                }
              }
              if (!this.platform.hiddenMasters.includes(accessory.context.eweDeviceId)) {
                oAccessory = this.platform.devicesInHB.get(accessory.context.eweDeviceId + 'SW0')
                oAccessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.On, masterState === 'on')
              }
              break
            }
          }
          break
        case 'brightness':
          if (value === 0) {
            params.switch = 'off'
          } else {
            if (!lightService.getCharacteristic(Characteristic.On).value) {
              params.switch = 'on'
            }
            switch (accessory.context.eweUIID) {
              case 36: //* ** KING-M4 ***\\
                params.bright = Math.round((value * 9) / 10 + 10)
                break
              case 44: //* ** D1 ***\\
                params.brightness = value
                params.mode = 0
                break
            }
          }
          await utils.sleep(250)
          await this.platform.sendDeviceUpdate(accessory, params)
          if (value === 0) {
            lightService.updateCharacteristic(Characteristic.On, false)
          } else {
            lightService.updateCharacteristic(Characteristic.Brightness, value)
          }
          break
        case 'c_brightness':
          switch (accessory.context.eweUIID) {
            case 22: //* ** B1 ***\\
              newRGB = convert.hsv.rgb(
                lightService.getCharacteristic(Characteristic.Hue).value,
                lightService.getCharacteristic(Characteristic.Saturation).value,
                value
              )
              params = {
                zyx_mode: 2,
                type: 'middle',
                channel0: '0',
                channel1: '0',
                channel2: newRGB[0].toString(),
                channel3: newRGB[1].toString(),
                channel4: newRGB[2].toString()
              }
              break
            case 59: //* ** L1 ***\\
              params = {
                mode: 1,
                bright: value
              }
              break
          }
          await utils.sleep(250)
          await this.platform.sendDeviceUpdate(accessory, params)
          lightService.updateCharacteristic(Characteristic.Brightness, value)
          break
        case 'c_hue':
          newRGB = convert.hsv.rgb(value, lightService.getCharacteristic(Characteristic.Saturation).value, 100)
          switch (accessory.context.eweUIID) {
            case 22: //* ** B1 ***\\
              params = {
                zyx_mode: 2,
                type: 'middle',
                channel0: '0',
                channel1: '0',
                channel2: newRGB[0].toString(),
                channel3: newRGB[1].toString(),
                channel4: newRGB[2].toString()
              }
              break
            case 59: //* ** L1 ***\\
              params = {
                mode: 1,
                colorR: newRGB[0],
                colorG: newRGB[1],
                colorB: newRGB[2]
              }
              break
          }
          await utils.sleep(250)
          await this.platform.sendDeviceUpdate(accessory, params)
          lightService.updateCharacteristic(Characteristic.Hue, value)
          break
      }
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, true)
    }
  }

  async externalUpdate (accessory, params) {
    try {
      if (
        cns.devicesSingleSwitch.includes(accessory.context.eweUIID) &&
        cns.devicesSingleSwitchLight.includes(accessory.context.eweModel)
      ) {
        let newColour
        let mode
        let isOn = false
        const lightService = accessory.getService(Service.Lightbulb)
        if (accessory.context.eweUIID === 22 && utils.hasProperty(params, 'state')) {
          isOn = params.state === 'on'
        } else if (accessory.context.eweUIID !== 22 && utils.hasProperty(params, 'switch')) {
          isOn = params.switch === 'on'
        } else {
          isOn = lightService.getCharacteristic(Characteristic.On).value
        }
        if (isOn) {
          lightService.updateCharacteristic(Characteristic.On, true)
          switch (accessory.context.eweUIID) {
            case 36: // KING-M4
              if (utils.hasProperty(params, 'bright')) {
                const nb = Math.round(((params.bright - 10) * 10) / 9) // eWeLink scale is 10-100 and HomeKit scale is 0-100.
                lightService.updateCharacteristic(Characteristic.Brightness, nb)
              }
              break
            case 44: // D1
              if (utils.hasProperty(params, 'brightness')) {
                lightService.updateCharacteristic(Characteristic.Brightness, params.brightness)
              }
              break
            case 22: // B1
              if (utils.hasProperty(params, 'zyx_mode')) {
                mode = parseInt(params.zyx_mode)
              } else if (utils.hasProperty(params, 'channel0') && parseInt(params.channel0) + parseInt(params.channel1) > 0) {
                mode = 1
              } else {
                mode = 2
              }
              if (mode === 2) {
                lightService.updateCharacteristic(Characteristic.On, true)
                newColour = convert.rgb.hsv(
                  parseInt(params.channel2),
                  parseInt(params.channel3),
                  parseInt(params.channel4)
                )
                lightService
                  .updateCharacteristic(Characteristic.Hue, newColour[0])
                  .updateCharacteristic(Characteristic.Saturation, 100)
                  .updateCharacteristic(Characteristic.Brightness, 100)
              } else if (mode === 1) {
                throw new Error('has been set to white mode which is not supported')
              }
              break
            case 59: // L1
              if (utils.hasProperty(params, 'bright')) {
                lightService.updateCharacteristic(Characteristic.Brightness, params.bright)
              }
              if (utils.hasProperty(params, 'colorR')) {
                newColour = convert.rgb.hsv(params.colorR, params.colorG, params.colorB)
                lightService
                  .updateCharacteristic(Characteristic.Hue, newColour[0])
                  .updateCharacteristic(Characteristic.Saturation, newColour[1])
              }
              break
            default:
              return
          }
        } else {
          lightService.updateCharacteristic(Characteristic.On, false)
        }
      } else if (
        cns.devicesMultiSwitch.includes(accessory.context.eweUIID) &&
        cns.devicesMultiSwitchLight.includes(accessory.context.eweModel)
      ) {
        if (!utils.hasProperty(params, 'switches')) return
        const idToCheck = accessory.context.hbDeviceId.slice(0, -1)
        let primaryState = false
        for (let i = 1; i <= accessory.context.channelCount; i++) {
          if (params.switches[i - 1].switch === 'on') {
            primaryState = true
          }
          if (this.platform.devicesInHB.has(idToCheck + i)) {
            const oAccessory = this.platform.devicesInHB.get(idToCheck + i)
            oAccessory.context.cacheOn = params.switches[i - 1].switch === 'on'
            oAccessory
              .getService(Service.Lightbulb)
              .updateCharacteristic(Characteristic.On, params.switches[i - 1].switch === 'on')
          }
        }
        if (!this.platform.hiddenMasters.includes(accessory.context.eweDeviceId)) {
          accessory.getService(Service.Lightbulb).updateCharacteristic(Characteristic.On, primaryState)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(accessory, err, false)
    }
  }
}
