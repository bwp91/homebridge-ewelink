/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const PLUGIN = require('./../package.json')
class eWeLinkPlatform {
  constructor (log, config, api) {
    // *** Disable the plugin if not configured correctly *** \\
    if (!log || !api) {
      return
    }
    try {
      if (!config || !config.username || !config.password || !config.countryCode) {
        throw new Error('eWeLink credentials missing from configuration')
      }

      // *** Set up our variables *** \\
      this.log = log
      this.config = config
      this.api = api
      this.helpers = require('./utils/helpers')
      this.debug = config.debug
      this.colourUtils = require('./utils/colour-utils')
      this.eveService = require('./fakegato/fakegato-history')(api)
      this.eveLogPath = api.user.storagePath() + '/persist/'
      this.mode = ['auto', 'wan', 'lan'].includes(config.mode) ? config.mode : 'auto'
      this.devicesInHB = new Map()
      this.devicesInEW = new Map()
      this.cusG = new Map()
      this.cusS = new Map()
      this.hiddenMasters = []
      this.obstructSwitches = {}
      if (Object.keys(config.groups || []).length > 0) {
        config.groups
          .filter(g => g.obstructId && g.deviceId && ['garage', 'garage_eachen'].includes(g.type))
          .forEach(g => (this.obstructSwitches[g.obstructId.toLowerCase()] = g.deviceId.toLowerCase()))
      }
      this.ignoredDevices = (config.ignoredDevices || '').replace(/[\s'"]+/g, '').toLowerCase().split(',')
      this.thTempOffset = {}
      if (Array.isArray(config.thTempOffset)) {
        config.thTempOffset.forEach(x => (this.thTempOffset[x.deviceId] = x.offset))
      }
      this.nameOverride = {}
      if (Array.isArray(config.nameOverride)) {
        config.nameOverride.forEach(x => (this.nameOverride[x.fullDeviceId] = x.deviceName))
      }
      this.ipOverride = {}
      if (Array.isArray(config.ipOverride)) {
        config.ipOverride.forEach(x => (this.ipOverride[x.deviceId] = x.deviceIP))
      }

      // *** Set up Homebridge API events *** \\
      this.api.on('didFinishLaunching', this.eWeLinkSetup.bind(this))
      this.api.on('shutdown', this.eWeLinkShutdown.bind(this))
    } catch (err) {
      const errToShow = err.message + (err.lineNumber ? ' [line ' + err.lineNumber + ']' : '')
      log.warn('*** Disabling plugin [v%s] ***', PLUGIN.version)
      log.warn('*** %s. ***', errToShow)
    }
  }

  async eWeLinkSetup () {
    try {
      // *** Check to see if the user has disabled the plugin *** \\
      if (this.config.disablePlugin) {
        this.devicesInHB.forEach(a => this.removeAccessory(a))
        throw new Error('To change this, set disablePlugin to false')
      }

      // *** Set up initial sync with eWeLink *** \\
      this.log('Plugin [v%s] initialised. Syncing with eWeLink...', PLUGIN.version)

      // *** Set up the HTTP client, get the user HTTP host, and login *** \\
      this.httpClient = new (require('./connection/http'))(this)
      await this.httpClient.getHost()
      const authData = await this.httpClient.login()

      // *** Get a device list and add to the devicesInEW map *** \\
      const deviceList = await this.httpClient.getDevices()
      deviceList.forEach(device => this.devicesInEW.set(device.deviceid, device))

      // *** Set up the WS client, get the user WS host, and login *** \\
      if (this.mode !== 'lan') {
        this.wsClient = new (require('./connection/ws'))(this, authData)
        await this.wsClient.getHost()
        this.wsClient.login()
      }

      // *** Set up the LAN client, scan for devices and start monitoring *** \\
      if (this.mode !== 'wan') {
        this.lanClient = new (require('./connection/lan'))(this, deviceList)
        this.lanDevices = await this.lanClient.getHosts()
        await this.lanClient.startMonitor()
      }

      // *** Check for valid Accessory Simulations and add to cusG for later use *** \\
      if (Object.keys(this.config.groups || []).length > 0) {
        this.config.groups.filter(g => g.type && this.helpers.allowedGroups.includes(g.type))
          .filter(g => g.deviceId && this.devicesInEW.has(g.deviceId.toLowerCase()))
          .forEach(g => this.cusG.set(g.deviceId.toLowerCase(), g))
      }

      // *** Check for valid custom RF Bridge sensors and add to cusS for later use *** \\
      if (Object.keys(this.config.bridgeSensors || []).length > 0) {
        this.config.bridgeSensors
          .filter(s => s.fullDeviceId && this.devicesInEW.has(s.fullDeviceId.split('SW')[0].toString().toLowerCase()))
          .forEach(s => this.cusS.set(s.fullDeviceId, s))
      }

      // *** Remove HB accessories that are no longer in eWeLink account *** \\
      this.devicesInHB.forEach(accessory => {
        if (!this.devicesInEW.has(accessory.context.eweDeviceId)) {
          this.removeAccessory(accessory)
        }
      })

      // *** Initialise each device into HB *** \\
      this.devicesInEW.forEach(device => this.initialiseDevice(device))

      // *** Set up the WS and LAN listener for device updates *** \\
      if (this.wsClient) {
        this.wsClient.receiveUpdate(device => this.receiveDeviceUpdate(device))
      }
      if (this.lanClient) {
        this.lanClient.receiveUpdate(device => this.receiveDeviceUpdate(device))
      }

      // *** Refresh the WS connection every 60 minutes *** \\
      if (this.wsClient) {
        this.wsRefresh = setInterval(async () => {
          try {
            await this.wsClient.getHost()
            await this.wsClient.closeConnection()
            await this.helpers.sleep(250)
            await this.wsClient.login()
          } catch (err) {
            this.log.warn(this.debug ? err : err.message)
          }
        }, 3600000)
      }

      // *** Log for informative purposes *** \\
      this.log('✓ Setup complete. %s', this.helpers.logMessages[Math.floor(Math.random() * this.helpers.logMessages.length)])
    } catch (err) {
      // *** Catch errors at any point during setup *** \\
      const errToShow = err.message + (err.lineNumber ? ' [line ' + err.lineNumber + ']' : '')
      this.log.warn('*** Disabling plugin [v%s] ***', PLUGIN.version)
      this.log.warn('*** %s ***', errToShow)

      // *** Call the shutdown function as plugin is disabled *** \\
      this.eWeLinkShutdown()
    }
  }

  eWeLinkShutdown () {
    // *** Attempt to close WS and stop LAN monitor if this has been setup *** \\
    try {
      if (this.lanClient) {
        this.lanClient.closeConnection()
      }
      if (this.wsClient) {
        clearInterval(this.wsRefresh)
        this.wsClient.closeConnection()
      }
    } catch (err) {}
  }

  initialiseDevice (device) {
    let accessory
    let oAccessory
    try {
      // *** Set up the correct instance for this particular device *** \\
      if (this.helpers.devicesCurtain.includes(device.extra.uiid)) {
        /***********************
        BLINDS [EWELINK UIID 11]
        ***********************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, this.helpers.defaultCurtainCache)
        accessory.control = new (require('./device/curtain'))(this, accessory)
        /**********************/
      } else if (this.cusG.has(device.deviceid) && this.cusG.get(device.deviceid).type === 'blind') {
        /****************************
        BLINDS [ACCESSORY SIMULATION]
        ****************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, this.helpers.defaultBlindCache)
        accessory.control = new (require('./device/simulation/blind'))(this, accessory)
        /***************************/
      } else if (this.helpers.hasProperty(this.obstructSwitches, device.deviceid)) {
        /*****************************
        OBSTRUCTION DETECTION SWITCHES
        *****************************/
        accessory = this.addAccessory(device, device.deviceid + 'SWX', true)
        accessory.control = new (require('./device/simulation/garage-od-switch'))(this, accessory)
        /****************************/
      } else if (this.cusG.has(device.deviceid) && this.cusG.get(device.deviceid).type === 'garage') {
        /****************************************
        GARAGE DOORS [ONE] [ACCESSORY SIMULATION]
        ****************************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, this.helpers.defaultGarageCache)
        accessory.control = new (require('./device/simulation/garage-one'))(this, accessory)
        /***************************************/
      } else if (this.cusG.has(device.deviceid) && this.cusG.get(device.deviceid).type === 'garage_two') {
        /****************************************
        GARAGE DOORS [TWO] [ACCESSORY SIMULATION]
        ****************************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, this.helpers.defaultGarageTwoCache)
        accessory.control = new (require('./device/simulation/garage-two'))(this, accessory)
        /***************************************/
      } else if (this.cusG.has(device.deviceid) && this.cusG.get(device.deviceid).type === 'garage_four') {
        /*****************************************
        GARAGE DOORS [FOUR] [ACCESSORY SIMULATION]
        *****************************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, this.helpers.defaultGarageFourCache)
        accessory.control = new (require('./device/simulation/garage-four'))(this, accessory)
        /****************************************/
      } else if (this.cusG.has(device.deviceid) && this.cusG.get(device.deviceid).type === 'garage_eachen') {
        /***************************
        GARAGE DOORS [EACHEN GD-DC5]
        ***************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/garage-eachen'))(this, accessory)
        /**************************/
      } else if (this.cusG.has(device.deviceid) && this.cusG.get(device.deviceid).type === 'lock') {
        /***************************
        LOCKS [ACCESSORY SIMULATION]
        ***************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/lock-one'))(this, accessory)
        /**************************/
      } else if (this.cusG.has(device.deviceid) && this.cusG.get(device.deviceid).type === 'switch_valve') {
        /**********************************
        SWITCH-VALVE [ACCESSORY SIMULATION]
        **********************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/switch-valve'))(this, accessory)
        /*********************************/
      } else if (this.cusG.has(device.deviceid) && this.cusG.get(device.deviceid).type === 'tap') {
        /********************************
        TAPS [ONE] [ACCESSORY SIMULATION]
        ********************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/tap-one'))(this, accessory)
        /*******************************/
      } else if (this.cusG.has(device.deviceid) && this.cusG.get(device.deviceid).type === 'tap_two') {
        /********************************
        TAPS [TWO] [ACCESSORY SIMULATION]
        ********************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/tap-two'))(this, accessory)
        /*******************************/
      } else if (this.cusG.has(device.deviceid) && this.cusG.get(device.deviceid).type === 'valve') {
        /**********************************
        VALVES [ONE] [ACCESSORY SIMULATION]
        **********************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/valve-one'))(this, accessory)
        /*********************************/
      } else if (this.cusG.has(device.deviceid) && this.cusG.get(device.deviceid).type === 'valve_two') {
        /**********************************
        VALVES [TWO] [ACCESSORY SIMULATION]
        **********************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/valve-two'))(this, accessory)
        /*********************************/
      } else if (this.cusG.has(device.deviceid) && this.cusG.get(device.deviceid).type === 'valve_four') {
        /***********************************
        VALVES [FOUR] [ACCESSORY SIMULATION]
        ***********************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/valve-four'))(this, accessory)
        /**********************************/
      } else if (this.helpers.devicesSensor.includes(device.extra.uiid)) {
        /*******************
        SENSORS [SONOFF DW2]
        *******************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, { type: 'sensor' })
        accessory.control = new (require('./device/sensor'))(this, accessory)
        /******************/
      } else if (this.helpers.devicesFan.includes(device.extra.uiid)) {
        /***
        FANS
        ***/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/fan'))(this, accessory)
        /**/
      } else if (this.helpers.devicesDiffuser.includes(device.extra.uiid)) {
        /********
        DIFFUSERS
        ********/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/diffuser'))(this, accessory)
        /*******/
      } else if (this.helpers.devicesThermostat.includes(device.extra.uiid)) {
        /********************
        THERMOSTATS [TH10/16]
        ********************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, { sensorType: device.params.sensorType })
        accessory.control = (this.config.thAsThermostat || '').split(',').includes(device.deviceid)
          ? new (require('./device/th-thermo'))(this, accessory)
          : new (require('./device/th-outlet'))(this, accessory)
        /*******************/
      } else if (
        this.helpers.devicesOutlet.includes(device.extra.uiid) ||
        (this.helpers.devicesSingleSwitch.includes(device.extra.uiid) && this.helpers.devicesSingleSwitchOutlet.includes(device.productModel))
      ) {
        /******
        OUTLETS
        ******/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = (this.config.outletAsSwitch || '').split(',').includes(device.deviceid)
          ? new (require('./device/switch-single'))(this, accessory)
          : new (require('./device/outlet'))(this, accessory)
        /*****/
      } else if (this.helpers.devicesUSB.includes(device.extra.uiid)) {
        /**********
        USB OUTLETS
        **********/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/usb'))(this, accessory)
        /*********/
      } else if (this.helpers.devicesSCM.includes(device.extra.uiid)) {
        /*********************************
        SINGLE CHL [MULTIPLE CHL HARDWARE]
        *********************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/scm'))(this, accessory)
        /********************************/
      } else if (this.helpers.devicesCTempable.includes(device.extra.uiid)) {
        /*******************
        LIGHTS [COLOUR TEMP]
        *******************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/light-ctemp'))(this, accessory)
        /******************/
      } else if (this.helpers.devicesColourable.includes(device.extra.uiid)) {
        /******************
        LIGHTS [COLOUR RGB]
        ******************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/light-colour'))(this, accessory)
        /*****************/
      } else if (this.helpers.devicesBrightable.includes(device.extra.uiid)) {
        /**************
        LIGHTS [DIMMER]
        **************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/light-dimmer'))(this, accessory)
        /*************/
      } else if (this.helpers.devicesSingleSwitch.includes(device.extra.uiid)) {
        /************************
        SWITCHES [SINGLE CHANNEL]
        ************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = (this.config.switchAsOutlet || '').split(',').includes(device.deviceid)
          ? new (require('./device/outlet'))(this, accessory)
          : new (require('./device/switch-single'))(this, accessory)
        /***********************/
      } else if (this.helpers.devicesMultiSwitch.includes(device.extra.uiid)) {
        /***********************
        SWITCHES [MULTI CHANNEL]
        ***********************/
        for (let i = 0; i <= this.helpers.chansFromUiid[device.extra.uiid]; i++) {
          if ((this.config.hideChanFromHB || '').split(',').includes(device.deviceid + 'SW' + i)) {
            if (this.devicesInHB.has(device.deviceid + 'SW' + i)) {
              this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SW' + i))
            }
            if (i === 0) {
              this.hiddenMasters.push(device.deviceid)
            }
            oAccessory = this.addAccessory(device, device.deviceid + 'SW' + i, true)
          } else {
            oAccessory = this.devicesInHB.has(device.deviceid + 'SW' + i)
              ? this.devicesInHB.get(device.deviceid + 'SW' + i)
              : this.addAccessory(device, device.deviceid + 'SW' + i)
            oAccessory.getService(this.api.hap.Service.AccessoryInformation)
              .setCharacteristic(this.api.hap.Characteristic.FirmwareRevision, device.params.fwVersion || PLUGIN.version)
          }
          oAccessory.context.reachableWAN = device.online
          oAccessory.context.reachableLAN = this.lanClient && this.lanDevices.has(device.deviceid)
            ? this.lanDevices.get(device.deviceid).ip
            : false
          oAccessory.context.eweBrandName = device.brandName
          oAccessory.context.eweBrandLogo = device.brandLogo
          oAccessory.context.eweShared = device.sharedBy && device.sharedBy.email ? device.sharedBy.email : false
          oAccessory.context.ip = this.lanClient && oAccessory.context.reachableLAN
            ? this.lanDevices.get(device.deviceid).ip
            : false
          oAccessory.control = new (require('./device/switch-multi'))(this, oAccessory)
          this.api.updatePlatformAccessories(PLUGIN.name, PLUGIN.alias, [oAccessory])
          this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory)
          if (i === 0) {
            accessory = oAccessory
          }
        }
        /**********************/
      } else if (this.helpers.devicesRFBridge.includes(device.extra.uiid)) {
        /*********************
        RF BRIDGE + SUBDEVICES
        *********************/
        let rfChlCounter = 0
        const rfMap = []
        if (this.helpers.hasProperty(device, 'tags') && this.helpers.hasProperty(device.tags, 'zyx_info')) {
          device.tags.zyx_info.forEach(remote =>
            rfMap.push({
              name: remote.name,
              type: remote.remote_type,
              buttons: Object.assign({}, ...remote.buttonName)
            })
          )
        }
        accessory = this.devicesInHB.has(device.deviceid + 'SW0')
          ? this.devicesInHB.get(device.deviceid + 'SW0')
          : this.addAccessory(device, device.deviceid + 'SW0', true, { rfMap }, 'rf_pri')
        accessory.control = new (require('./device/rf-bridge'))(this, accessory)
        this.hiddenMasters.push(device.deviceid)
        rfMap.forEach(subDevice => {
          const swNumber = rfChlCounter + 1
          let subType
          let sensorTimeLength
          let subExtraContext = {}
          if (['1', '2', '3', '4'].includes(subDevice.type)) {
            subType = 'button'
          } else if (subDevice.type === '5') {
            subType = 'curtain'
          } else if (subDevice.type === '6') {
            subType = this.cusS.has(device.deviceid + 'SW' + swNumber)
              ? this.cusS.get(device.deviceid + 'SW' + swNumber).type
              : 'motion'
            if (this.cusS.has(device.deviceid + 'SW' + swNumber)) {
              sensorTimeLength = this.cusS.get(device.deviceid + 'SW' + swNumber).sensorTimeLength
            }
          } else {
            this.log.warn('[%s] has an unsupported device type [%s].', device.name, subDevice.type || '?')
            return
          }
          subExtraContext = {
            buttons: subDevice.buttons,
            subType,
            swNumber,
            sensorTimeLength,
            name: subDevice.name
          }
          if ((oAccessory = this.devicesInHB.get(device.deviceid + 'SW' + swNumber))) {
            if (
              (this.config.resetRFBridge || '').split(',').includes(device.deviceid) ||
              oAccessory.context.subType !== subType ||
              oAccessory.context.sensorTimeLength !== sensorTimeLength ||
              oAccessory.context.swNumber !== swNumber
            ) {
              this.removeAccessory(oAccessory)
            }
          }
          oAccessory = this.devicesInHB.has(device.deviceid + 'SW' + swNumber)
            ? this.devicesInHB.get(device.deviceid + 'SW' + swNumber)
            : this.addAccessory(device, device.deviceid + 'SW' + swNumber, false, subExtraContext, 'rf_sub')
          oAccessory.getService(this.api.hap.Service.AccessoryInformation)
            .setCharacteristic(this.api.hap.Characteristic.FirmwareRevision, device.params.fwVersion || PLUGIN.version)
          oAccessory.context.reachableWAN = device.online
          oAccessory.context.reachableLAN = false
          oAccessory.context.eweBrandName = device.brandName
          oAccessory.context.eweBrandLogo = device.brandLogo
          oAccessory.context.eweShared = device.sharedBy && device.sharedBy.email ? device.sharedBy.email : false
          oAccessory.context.ip = this.lanClient && oAccessory.context.reachableLAN ? this.lanDevices.get(device.deviceid).ip : false
          this.api.updatePlatformAccessories(PLUGIN.name, PLUGIN.alias, [oAccessory])
          this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory)
          oAccessory.control = new (require('./device/rf-bridge'))(this, oAccessory)
          rfChlCounter += Object.keys(subDevice.buttons || {}).length
        })
        accessory.context.channelCount = rfChlCounter
        this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
        /********************/
      } else if (this.helpers.devicesZBBridge.includes(device.extra.uiid)) {
        /************
        ZIGBEE BRIDGE
        ************/
        return
        /***********/
      } else if (this.helpers.devicesZBSwitchStateless.includes(device.extra.uiid)) {
        /**********************
        ZIGBEE STATELESS SWITCH
        **********************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/zigbee/switch-stateless'))(this, accessory)
        /*********************/
      } else if (this.helpers.devicesZBSwitchSingle.includes(device.extra.uiid)) {
        /***************
        ZB SINGLE SWITCH
        ***************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/zigbee/switch-single'))(this, accessory)
        /**************/
      } else if (this.helpers.devicesZBLightDimmer.includes(device.extra.uiid)) {
        /*****************
        ZB LIGHTS [DIMMER]
        *****************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/zigbee/light-dimmer'))(this, accessory)
        /****************/
      } else if (this.helpers.devicesZBSensorAmbient.includes(device.extra.uiid)) {
        /******************
        ZB SENSOR [AMBIENT]
        ******************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/zigbee/sensor-ambient'))(this, accessory)
        /*****************/
      } else if (this.helpers.devicesZBSensorMotion.includes(device.extra.uiid)) {
        /*****************
        ZB SENSOR [MOTION]
        *****************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/zigbee/sensor-motion'))(this, accessory)
        /****************/
      } else if (this.helpers.devicesZBSensorContact.includes(device.extra.uiid)) {
        /******************
        ZB SENSOR [CONTACT]
        ******************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/zigbee/sensor-contact'))(this, accessory)
        /*****************/
      } else if (this.helpers.devicesCamera.includes(device.extra.uiid)) {
        /*************
        SONOFF CAMERAS
        *************/
        this.log('[%s] see the homebridge-ewelink wiki for details to enable the camera.', device.name)
        return
        /************/
      } else if (this.helpers.devicesEweCamera.includes(device.extra.uiid)) {
        /******************
        EWELINK APP CAMERAS
        ******************/
        this.log('[%s] has not been added as it is not supported.', device.name)
        return
        /*****************/
      } else {
        /**************
        UNKNOWN DEVICES
        **************/
        this.log.warn('[%s] has not been added as it is not supported. Please make a GitHub issue request.', device.name)
        return
        /*************/
      }

      // *** Update the current firmware version *** \\
      if (
        !this.hiddenMasters.includes(device.deviceid) &&
        !this.helpers.hasProperty(this.obstructSwitches, device.deviceid)
      ) {
        accessory.getService(this.api.hap.Service.AccessoryInformation)
          .setCharacteristic(this.api.hap.Characteristic.FirmwareRevision, device.params.fwVersion || PLUGIN.version)
      }

      // *** Update the reachability values (via WS and LAN) *** \\
      accessory.context.reachableWAN = device.online
      accessory.context.reachableLAN = this.lanClient && this.lanDevices.has(device.deviceid)
        ? this.lanDevices.get(device.deviceid).ip
        : false
      accessory.context.eweBrandName = device.brandName
      accessory.context.eweBrandLogo = device.brandLogo
      accessory.context.eweShared = device.sharedBy && device.sharedBy.email ? device.sharedBy.email : false
      accessory.context.ip = this.lanClient && accessory.context.reachableLAN
        ? this.lanDevices.get(device.deviceid).ip
        : false

      // *** Helpful logging for each device *** \\
      const str = accessory.context.reachableLAN
        ? 'found locally with IP [' + this.lanDevices.get(device.deviceid).ip + ']'
        : this.helpers.devicesLAN.includes(device.extra.uiid)
          ? 'LAN mode unavailable as unreachable'
          : 'LAN mode unavailable as not supported'

      // *** Update accessory characteristics with latest values *** \\
      if (this.wsClient) {
        accessory.control.externalUpdate(device.params)
      }

      // *** Update any changes to the device into our devicesInHB map *** \\
      this.api.updatePlatformAccessories(PLUGIN.name, PLUGIN.alias, [accessory])
      this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
      this.log('[%s] initialised and %s.', device.name, str)
    } catch (err) {
      // *** Catch errors at any point during device initialisation *** \\
      const errToShow = this.debug
        ? ':\n' + err
        : ' ' + err.message + (err.lineNumber ? ' [line ' + err.lineNumber + '].' : '')
      this.log.warn('[%s] could not be initialised as %s.', device.name, errToShow)
    }
  }

  addAccessory (device, hbDeviceId, hidden = false, extraContext = {}, type = '') {
    let newDeviceName
    try {
      // *** Get the switchNumber which can be {X, 0, 1, 2, 3, 4, ...} *** \\
      const switchNumber = hbDeviceId.split('SW')[1].toString()
      const channelCount = type === 'rf_pri'
        ? Object.keys((device.tags && device.tags.zyx_info) || []).length
        : this.helpers.chansFromUiid[device.extra.uiid]

      // *** Set up the device name which can depend on the accessory type *** \\
      if (this.nameOverride[hbDeviceId]) {
        newDeviceName = this.nameOverride[hbDeviceId]
      } else if (type === 'rf_sub') {
        newDeviceName = extraContext.name
      } else {
        newDeviceName = device.name
        if (['1', '2', '3', '4'].includes(switchNumber)) {
          if (device.tags && device.tags.ck_channel_name && device.tags.ck_channel_name[parseInt(switchNumber) - 1]) {
            newDeviceName = device.tags.ck_channel_name[parseInt(switchNumber) - 1]
          } else {
            newDeviceName += ' SW' + switchNumber
          }
        }
      }

      // *** Add the new accessory to Homebridge *** \\
      const accessory = new this.api.platformAccessory(newDeviceName, this.api.hap.uuid.generate(hbDeviceId))
      if (!hidden) {
        accessory.getService(this.api.hap.Service.AccessoryInformation)
          .setCharacteristic(this.api.hap.Characteristic.SerialNumber, hbDeviceId)
          .setCharacteristic(this.api.hap.Characteristic.Manufacturer, device.brandName)
          .setCharacteristic(this.api.hap.Characteristic.Model, device.productModel + ' (' + device.extra.model + ')')
          .setCharacteristic(this.api.hap.Characteristic.FirmwareRevision, device.params.fwVersion || PLUGIN.version)
          .setCharacteristic(this.api.hap.Characteristic.Identify, true)
        accessory.on('identify', (paired, callback) => {
          callback()
          this.log('[%s] identify button pressed.', accessory.displayName)
        })
      }

      // *** Add helpful context values to the accessory *** \\
      accessory.context = {
        ...{
          hbDeviceId,
          eweDeviceId: device.deviceid,
          eweUIID: device.extra.uiid,
          eweModel: device.productModel,
          eweApiKey: device.apikey,
          switchNumber,
          channelCount
        },
        ...extraContext
      }

      // *** Register the accessory if it hasn't been hidden by the user *** \\
      if (!hidden) {
        this.api.registerPlatformAccessories(PLUGIN.name, PLUGIN.alias, [accessory])
        this.log('[%s] has been added to Homebridge.', newDeviceName)
      }

      // *** Return the new accessory *** \\
      return accessory
    } catch (err) {
      // *** Catch any errors whilst trying to add the accessory *** \\
      const errToShow = this.debug
        ? ':\n' + err
        : ' ' + err.message + (err.lineNumber ? ' [line ' + err.lineNumber + '].' : '')
      this.log.warn('[%s] could not be added to Homebridge as%s', newDeviceName, errToShow)
      return false
    }
  }

  configureAccessory (accessory) {
    // *** Function is called for each device on HB start *** \\
    try {
      if (!this.log) {
        return
      }

      // *** Add each cached device to our devicesInHB map *** \\
      this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
    } catch (err) {
      const errToShow = this.debug
        ? ':\n' + err
        : ' ' + err.message + (err.lineNumber ? ' [line ' + err.lineNumber + '].' : '')
      this.log.warn('[%s] could not be configured as%s', accessory.displayName, errToShow)
    }
  }

  removeAccessory (accessory) {
    try {
      // *** Unregister the accessory from HB and remove it from our devicesInHB map *** \\
      this.api.unregisterPlatformAccessories(PLUGIN.name, PLUGIN.alias, [accessory])
      this.devicesInHB.delete(accessory.context.hbDeviceId)
      this.log('[%s] has been removed from Homebridge.', accessory.displayName)
    } catch (err) {
      const errToShow = this.debug
        ? ':\n' + err
        : ' ' + err.message + (err.lineNumber ? ' [line ' + err.lineNumber + '].' : '')
      this.log.warn('[%s] could not removed from Homebridge as%s', accessory.displayName, errToShow)
    }
  }

  async sendDeviceUpdate (accessory, params) {
    // *** Add a random delay of [1, 250]ms to avoid multiple http/ws requests a la vez
    await this.helpers.sleep(Math.floor(Math.random() * 250 + 1))

    // *** Log the update being sent *** \\
    if (this.debug) {
      this.log('[%s] sending update %s.', accessory.displayName, JSON.stringify(params))
    }

    // *** Set up the payload to send via LAN/WS *** \\
    const payload = {
      apikey: accessory.context.eweApiKey,
      deviceid: accessory.context.eweDeviceId,
      params
    }

    // *** Quick check to see if LAN mode is supported *** \\
    const res = !this.lanClient
      ? 'LAN mode is disabled'
      : !this.helpers.devicesLAN.includes(accessory.context.eweUIID)
        ? 'LAN mode is not supported for this device'
        : await this.lanClient.sendUpdate(payload)

    // *** Revert to WS if LAN mode not possible for whatever reason *** \\
    if (res !== 'ok') {
      // *** Check to see if the device is online *** \\
      if (this.wsClient && accessory.context.reachableWAN) {
        if (this.debug) {
          this.log('[%s] Reverting to web socket as %s.', accessory.displayName, res)
        }
        await this.wsClient.sendUpdate(payload)
      } else {
        throw new Error('it is unreachable')
      }
    }
  }

  async receiveDeviceUpdate (device) {
    const deviceId = device.deviceid
    let accessory
    let reachableChange = false

    // *** Find our accessory for which the updates relates to *** \\
    if ((accessory = this.devicesInHB.get(deviceId + 'SWX') || this.devicesInHB.get(deviceId + 'SW0'))) {
      if (this.debug) {
        this.log('[%s] receiving update %s.', accessory.displayName, JSON.stringify(device.params))
      }
      if (device.params.updateSource === 'WS') {
        // *** The update is from WS so update the WS online/offline status *** \\
        if (device.params.online !== accessory.context.reachableWAN) {
          accessory.context.reachableWAN = device.params.online
          this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
          reachableChange = true
          this.log('[%s] reported [%sline] via WS.', accessory.displayName, accessory.context.reachableWAN ? 'on' : 'off')
          if (accessory.context.reachableWAN && this.wsClient) {
            try {
              this.wsClient.requestUpdate(accessory)
            } catch (err) {}
          }
        }
      }
      if (device.params.updateSource === 'LAN' && !accessory.context.reachableLAN) {
        // *** The update is from LAN so it must be online *** \\
        accessory.context.reachableLAN = true
        this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
        reachableChange = true
        this.log('[%s] has been reported [online] via LAN.', accessory.displayName)
        if (accessory.context.reachableWAN && this.wsClient) {
          try {
            this.wsClient.requestUpdate(accessory)
          } catch (err) {}
        }
      }

      // *** Update this new online/offline status for all switches of multi channel devices (ie not X) *** \\
      if (reachableChange && accessory.context.hbDeviceId.substr(-1) !== 'X') {
        // *** Loop through to see which channels are in HB *** \\
        for (let i = 1; i <= accessory.context.channelCount; i++) {
          if (this.devicesInHB.has(deviceId + 'SW' + i)) {
            const oAccessory = this.devicesInHB.get(deviceId + 'SW' + i)
            oAccessory.context.reachableWAN = device.params.online
            if (device.params.updateSource === 'LAN') {
              oAccessory.context.reachableLAN = true
            }
            this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory)
          }
        }
      }
      try {
        // *** Update the accessory with the new data *** \\
        accessory.control.externalUpdate(device.params)
      } catch (err) {
        const errToShow = this.debug
          ? ':\n' + err
          : ' ' + err.message + (err.lineNumber ? ' [line ' + err.lineNumber + '].' : '')
        this.log.warn('[%s] could not be refreshed as%s', accessory.displayName, errToShow)
      }
    } else {
      // *** The device does not existing in HB so let's try to add it *** \\
      try {
        // *** Check to see it doesn't exist because it's user hidden *** \\
        if (this.ignoredDevices.includes(deviceId)) {
          return
        }

        // *** Log the update if debug is set to true *** \\
        if (this.debug) {
          this.log('[%s] receiving update for new device %s.', device.name, JSON.stringify(device.params))
        }

        // *** Obtain full device information from the HTTP API *** \\
        const newDevice = await this.httpClient.getDevice(deviceId)

        // *** Initialise the device in HB *** \\
        this.initialiseDevice(newDevice)

        // *** Add the device to the LAN client map *** \\
        if (this.lanClient && this.helpers.devicesLAN.includes(newDevice.extra.uiid)) {
          this.lanClient.addDeviceToMap(newDevice)
        }
      } catch (err) {
        // *** Automatically adding the new device failed for some reason *** \\
        const errToShow = this.debug
          ? ':\n' + err
          : ' ' + err.message + (err.lineNumber ? ' [line ' + err.lineNumber + '].' : '')
        this.log.warn('[%s] restart Homebridge to add new device, failed to add automatically as%s', deviceId, errToShow)
      }
    }
  }

  async deviceUpdateError (accessory, err, requestRefresh) {
    const errToShow = this.debug
      ? ':\n' + err
      : ' ' + err.message + (err.lineNumber ? ' [line ' + err.lineNumber + '].' : '')
    this.log.warn('[%s] device update failed as%s.', accessory.displayName, errToShow)

    // *** We only request a device refresh on failed internal updates (ie with 'set' handlers) *** \\
    if (requestRefresh && accessory.context.reachableWAN && this.wsClient) {
      try {
        await this.wsClient.requestUpdate(accessory)
      } catch (err) {}
    }
  }
}

module.exports = hb => hb.registerPlatform(PLUGIN.alias, eWeLinkPlatform)
