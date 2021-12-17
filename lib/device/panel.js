/* jshint node: true, esversion: 10, -W014, -W033 */
/* eslint-disable new-cap */
'use strict'

module.exports = class deviceSwitchSingle {
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
    this.tempOffsetFactor = deviceConf && deviceConf.offsetFactor

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

    // Add the temperature sensor service if it doesn't already exist
    this.tempService =
      this.accessory.getService(this.hapServ.TemperatureSensor) ||
      this.accessory.addService(this.hapServ.TemperatureSensor)

    // Set custom properties of the current temperature characteristic
    this.tempService.getCharacteristic(this.hapChar.CurrentTemperature).setProps({
      minStep: 0.1
    })
    this.cacheTemp = this.tempService.getCharacteristic(this.hapChar.CurrentTemperature).value
    this.updateCache()

    // Add the get handlers only if the user hasn't disabled the disableNoResponse setting
    if (!platform.config.disableNoResponse) {
      this.tempService
        .getCharacteristic(this.hapChar.CurrentTemperature)
        .setProps({
          minStep: 0.1
        })
        .onGet(() => {
          if (!this.isOnline) {
            throw new this.hapErr(-70402)
          }
          return this.tempService.getCharacteristic(this.hapChar.CurrentTemperature).value
        })
    }

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('custom', this.accessory, {
      log: platform.config.debugFakegato ? this.log : () => {}
    })

    // Output the customised options to the log
    const opts = JSON.stringify({
      logging: this.enableDebugLogging ? 'debug' : this.enableLogging ? 'standard' : 'disable',
      offset: this.tempOffset,
      offsetFactor: this.tempOffsetFactor
    })
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts)

    /*
      {
         "bindInfos":{
            "gaction":[
               ""
            ],
            "scene":2
         },
         "version":8,
         "pulses":[
            {
               "pulse":"off",
               "width":1000,
               "outlet":0
            },
            {
               "pulse":"off",
               "width":1000,
               "outlet":1
            }
         ],
         "switches":[
            {
               "switch":"off",
               "outlet":0
            },
            {
               "switch":"off",
               "outlet":1
            }
         ],
         "configure":[
            {
               "startup":"off",
               "outlet":0
            },
            {
               "startup":"off",
               "outlet":1
            }
         ],
         "lock":0,
         "fwVersion":"1.0.2",
         "temperature":24,
         "humidity":50,
         "tempUnit":0,
         "HMI_outdoorTemp":{
            "current":13,
            "range":"-2,14"
         },
         "HMI_weather":1,
         "cityId":"00000",
         "dst":0,
         "dstChange":"",
         "geo":"",
         "timeZone":1,
         "HMI_dimEnable":0,
         "HMI_resources":[
            {
               "ctype":"device",
               "id":"100000000",
               "uiid":6
            },
            {
               "ctype":"device",
               "id":"100000001",
               "uiid":1
            },
            {
               "ctype":"device",
               "id":"100000002",
               "uiid":6
            },
            {
               "ctype":"idle"
            },
            {
               "ctype":"idle"
            },
            {
               "ctype":"idle"
            },
            {
               "ctype":"idle"
            },
            {
               "ctype":"idle"
            }
         ],
         "HMI_ATCDevice":{
            "ctype":"device",
            "id":"100000000",
            "outlet":0,
            "etype":"hot"
         },
         "ctype":"device",
         "id":"100000000",
         "resourcetype":"ATC",
         "ATCMode":1,
         "ATCExpect0":23,
         "ATCEnable":1,
         "ATCExpect1":23
      }
    */
  }

  async externalUpdate (params) {
    try {
      if (this.funcs.hasProperty(params, 'temperature')) {
        let newTemp = Number(params.temperature)
        if (this.tempOffsetFactor) {
          newTemp *= this.tempOffset
        } else {
          newTemp += this.tempOffset
        }
        if (newTemp !== this.cacheTemp) {
          this.cacheTemp = newTemp
          this.tempService.updateCharacteristic(this.hapChar.CurrentTemperature, this.cacheTemp)
          this.accessory.eveService.addEntry({ temp: this.cacheTemp })
          if (params.updateSource && this.enableLogging) {
            this.log('[%s] %s [%s°C].', this.name, this.lang.curTemp, this.cacheTemp)
          }

          // Update the cache file with the new temperature
          this.updateCache()
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false)
    }
  }

  async updateCache () {
    // Don't continue if the storage client hasn't initialised properly
    if (!this.platform.storageClientData) {
      return
    }

    // Attempt to save the new temperature to the cache
    try {
      await this.platform.storageData.setItem(
        this.accessory.context.eweDeviceId + '_temp',
        this.cacheTemp
      )
    } catch (err) {
      if (this.enableLogging) {
        const eText = this.funcs.parseError(err)
        this.log.warn('[%s] %s %s.', this.name, this.lang.storageWriteErr, eText)
      }
    }
  }

  currentState () {
    const toReturn = {}
    toReturn.services = ['temperature']
    toReturn.temperature = {
      current: this.tempService.getCharacteristic(this.hapChar.CurrentTemperature).value
    }
    return toReturn
  }

  markStatus (isOnline) {
    this.isOnline = isOnline
  }
}
