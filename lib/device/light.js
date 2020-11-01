/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const convert = require('color-convert')
const helpers = require('./../helpers')
module.exports = class deviceLight {
  constructor (platform, accessory) {
    this.platform = platform
    this.Service = platform.api.hap.Service
    this.Characteristic = platform.api.hap.Characteristic
    const lightService = accessory.getService(this.Service.Lightbulb) || accessory.addService(this.Service.Lightbulb)
    lightService
      .getCharacteristic(this.Characteristic.On)
      .on('set', (value, callback) => this.internalUpdate('onoff', value, callback))
    if (helpers.devicesBrightable.includes(accessory.context.eweUIID)) {
      lightService.getCharacteristic(this.Characteristic.Brightness)
        .on('set', (value, callback) => this.internalUpdate('brightness', value, callback))
    } else if (helpers.devicesColourable.includes(accessory.context.eweUIID)) {
      lightService.getCharacteristic(this.Characteristic.Brightness)
        .on('set', (value, callback) => this.internalUpdate('c_brightness', value, callback))
      if (accessory.context.eweUIID === 22) {
        lightService
          .getCharacteristic(this.Characteristic.Brightness)
          .setProps({
            minStep: 100
          })
      }
      lightService
        .getCharacteristic(this.Characteristic.Hue)
        .on('set', (value, callback) => this.internalUpdate('c_hue', value, callback))
      lightService.getCharacteristic(this.Characteristic.Saturation).on('set', (value, callback) => callback())
    }
    this.accessory = accessory
  }

  async internalUpdate (type, value, callback) {
    callback()
    try {
      let oAccessory
      let newRGB
      let params = {}
      const lightService = this.accessory.getService(this.Service.Lightbulb)
      switch (type) {
        case 'onoff':
          switch (this.accessory.context.switchNumber) {
            case 'X':
              if (this.accessory.context.eweUIID === 22) {
              //* ** B1 ***\\
                params.state = value ? 'on' : 'off'
              } else {
                params.switch = value ? 'on' : 'off'
              }
              break
            case '0':
              params.switches = helpers.defaultMultiSwitchOff
              params.switches[0].switch = value ? 'on' : 'off'
              params.switches[1].switch = value ? 'on' : 'off'
              params.switches[2].switch = value ? 'on' : 'off'
              params.switches[3].switch = value ? 'on' : 'off'
              break
            case '1':
            case '2':
            case '3':
            case '4':
              params.switches = helpers.defaultMultiSwitchOff
              for (let i = 1; i <= 4; i++) {
                if ((oAccessory = this.platform.devicesInHB.get(this.accessory.context.eweDeviceId + 'SW' + i))) {
                  if (i === parseInt(this.accessory.context.switchNumber)) {
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
          await this.platform.sendDeviceUpdate(this.accessory, params)
          switch (this.accessory.context.switchNumber) {
            case '0':
              for (let i = 0; i <= 4; i++) {
                if ((oAccessory = this.platform.devicesInHB.get(this.accessory.context.eweDeviceId + 'SW' + i))) {
                  oAccessory.getService(this.Service.Lightbulb).updateCharacteristic(this.Characteristic.On, value)
                }
              }
              break
            case '1':
            case '2':
            case '3':
            case '4': {
              let masterState = 'off'
              for (let i = 1; i <= 4; i++) {
                if ((oAccessory = this.platform.devicesInHB.get(this.accessory.context.eweDeviceId + 'SW' + i))) {
                  if (oAccessory.getService(this.Service.Lightbulb).getCharacteristic(this.Characteristic.On).value) {
                    masterState = 'on'
                  }
                }
              }
              if (!this.platform.hiddenMasters.includes(this.accessory.context.eweDeviceId)) {
                oAccessory = this.platform.devicesInHB.get(this.accessory.context.eweDeviceId + 'SW0')
                oAccessory.getService(this.Service.Lightbulb).updateCharacteristic(this.Characteristic.On, masterState === 'on')
              }
              break
            }
          }
          break
        case 'brightness': {
          const updateKey = Math.random().toString(36).substr(2, 8)
          this.accessory.context.updateKey = updateKey
          switch (this.accessory.context.eweUIID) {
            case 36: //* ** KING-M4 ***\\
              params.bright = Math.round((value * 9) / 10 + 10)
              break
            case 44: //* ** D1 ***\\
              params.brightness = value
              params.mode = 0
              break
          }
          await helpers.sleep(500)
          if (updateKey !== this.accessory.context.updateKey) return
          await this.platform.sendDeviceUpdate(this.accessory, params)
          break
        }
        case 'c_brightness': {
          const updateKey = Math.random().toString(36).substr(2, 8)
          this.accessory.context.updateKey = updateKey
          switch (this.accessory.context.eweUIID) {
            case 22: //* ** B1 ***\\
              newRGB = convert.hsv.rgb(
                lightService.getCharacteristic(this.Characteristic.Hue).value,
                lightService.getCharacteristic(this.Characteristic.Saturation).value,
                value
              )
              if (newRGB[0] + newRGB[1] + newRGB[2] === 0) return
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
            case 104:
              params = {
                ltype: 'color',
                color: {
                  br: value,
                  r: this.accessory.context.cacheR,
                  g: this.accessory.context.cacheG,
                  b: this.accessory.context.cacheB
                }
              }
              break
          }
          await helpers.sleep(500)
          if (updateKey !== this.accessory.context.updateKey) return
          await this.platform.sendDeviceUpdate(this.accessory, params)
          break
        }
        case 'c_hue': {
          const updateKey = Math.random().toString(36).substr(2, 8)
          this.accessory.context.updateKey = updateKey
          newRGB = convert.hsv.rgb(value, lightService.getCharacteristic(this.Characteristic.Saturation).value, 100)
          switch (this.accessory.context.eweUIID) {
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
            case 104:
              params = {
                ltype: 'color',
                color: {
                  r: newRGB[0],
                  g: newRGB[1],
                  b: newRGB[2],
                  br: lightService.getCharacteristic(this.Characteristic.Brightness).value
                }
              }
              this.accessory.context.cacheR = newRGB[0]
              this.accessory.context.cacheG = newRGB[1]
              this.accessory.context.cacheB = newRGB[2]
              break
          }
          await helpers.sleep(500)
          if (updateKey !== this.accessory.context.updateKey) return
          await this.platform.sendDeviceUpdate(this.accessory, params)
          break
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true)
    }
  }

  async externalUpdate (params) {
    try {
      if (
        helpers.devicesSingleSwitch.includes(this.accessory.context.eweUIID) &&
        helpers.devicesSingleSwitchLight.includes(this.accessory.context.eweModel)
      ) {
        let newColour
        let mode
        let isOn = false
        const lightService = this.accessory.getService(this.Service.Lightbulb)
        if (this.accessory.context.eweUIID === 22 && helpers.hasProperty(params, 'state')) {
          isOn = params.state === 'on'
        } else if (this.accessory.context.eweUIID !== 22 && helpers.hasProperty(params, 'switch')) {
          isOn = params.switch === 'on'
        } else {
          isOn = lightService.getCharacteristic(this.Characteristic.On).value
        }
        if (isOn) {
          lightService.updateCharacteristic(this.Characteristic.On, true)
          switch (this.accessory.context.eweUIID) {
            case 36: // KING-M4
              if (helpers.hasProperty(params, 'bright')) {
                const nb = Math.round(((params.bright - 10) * 10) / 9) // eWeLink scale is 10-100 and HomeKit scale is 0-100.
                lightService.updateCharacteristic(this.Characteristic.Brightness, nb)
              }
              break
            case 44: // D1
              if (helpers.hasProperty(params, 'brightness')) {
                lightService.updateCharacteristic(this.Characteristic.Brightness, params.brightness)
              }
              break
            case 22: // B1
              if (helpers.hasProperty(params, 'zyx_mode')) {
                mode = parseInt(params.zyx_mode)
              } else if (helpers.hasProperty(params, 'channel0') && parseInt(params.channel0) + parseInt(params.channel1) > 0) {
                mode = 1
              } else {
                mode = 2
              }
              if (mode === 2) {
                newColour = convert.rgb.hsv(
                  parseInt(params.channel2),
                  parseInt(params.channel3),
                  parseInt(params.channel4)
                )
                lightService
                  .updateCharacteristic(this.Characteristic.Hue, newColour[0])
                  .updateCharacteristic(this.Characteristic.Saturation, 100)
                  .updateCharacteristic(this.Characteristic.Brightness, 100)
              }
              break
            case 59: // L1
              if (helpers.hasProperty(params, 'bright')) {
                lightService.updateCharacteristic(this.Characteristic.Brightness, params.bright)
              }
              if (helpers.hasProperty(params, 'colorR')) {
                newColour = convert.rgb.hsv(params.colorR, params.colorG, params.colorB)
                lightService
                  .updateCharacteristic(this.Characteristic.Hue, newColour[0])
                  .updateCharacteristic(this.Characteristic.Saturation, newColour[1])
              }
              break
            case 104: // GTLC104
              if (helpers.hasProperty(params, 'ltype')) {
                mode = params.ltype
                if (mode === 'color' && helpers.hasProperty(params, 'color')) {
                  if (helpers.hasProperty(params.color, 'br')) {
                    lightService.updateCharacteristic(this.Characteristic.Brightness, params.color.br)
                  }
                  if (
                    helpers.hasProperty(params.color, 'r') &&
                    helpers.hasProperty(params.color, 'g') &&
                    helpers.hasProperty(params.color, 'b')
                  ) {
                    newColour = convert.rgb.hsv(
                      parseInt(params.color.r),
                      parseInt(params.color.g),
                      parseInt(params.color.b)
                    )
                    lightService
                      .updateCharacteristic(this.Characteristic.Hue, newColour[0])
                      .updateCharacteristic(this.Characteristic.Saturation, 100)
                  }
                  this.accessory.context.cacheR = params.color.r
                  this.accessory.context.cacheG = params.color.g
                  this.accessory.context.cacheB = params.color.b
                }
              }
              break
            default:
              return
          }
        } else {
          lightService.updateCharacteristic(this.Characteristic.On, false)
        }
      } else if (
        helpers.devicesMultiSwitch.includes(this.accessory.context.eweUIID) &&
        helpers.devicesMultiSwitchLight.includes(this.accessory.context.eweModel)
      ) {
        if (!helpers.hasProperty(params, 'switches')) return
        const idToCheck = this.accessory.context.hbDeviceId.slice(0, -1)
        let primaryState = false
        for (let i = 1; i <= this.accessory.context.channelCount; i++) {
          if (params.switches[i - 1].switch === 'on') {
            primaryState = true
          }
          if (this.platform.devicesInHB.has(idToCheck + i)) {
            const oAccessory = this.platform.devicesInHB.get(idToCheck + i)
            oAccessory.context.cacheOn = params.switches[i - 1].switch === 'on'
            oAccessory
              .getService(this.Service.Lightbulb)
              .updateCharacteristic(this.Characteristic.On, params.switches[i - 1].switch === 'on')
          }
        }
        if (!this.platform.hiddenMasters.includes(this.accessory.context.eweDeviceId)) {
          this.accessory.getService(this.Service.Lightbulb).updateCharacteristic(this.Characteristic.On, primaryState)
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }
}
