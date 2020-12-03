/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
class eWeLinkPlatform {
  constructor (log, config, api) {
    this.version = require('./../package.json').version

    // *** Disable the plugin if not configured correctly *** \\
    if (!log || !api || !config) return
    if (!config.username || !config.password || !config.countryCode) {
      log.warn('*** Disabling plugin [v%s] ***', this.version)
      log.warn('*** eWeLink credentials missing from configuration ***')
      return
    }

    // *** Set up our variables *** \\
    this.log = log
    this.config = config
    this.api = api
    this.helpers = require('./utils/helpers')
    this.Characteristic = api.hap.Characteristic
    this.Service = api.hap.Service
    this.eveService = require('./fakegato/fakegato-history')(api)
    this.debug = this.config.debug || false
    this.devicesInHB = new Map()
    this.devicesInEW = new Map()
    this.cusG = new Map()
    this.cusS = new Map()
    this.hiddenMasters = []
    this.nameOverrideTmp = {}
    this.ipOverrideTmp = {}
    if (config.nameOverride) config.nameOverride.forEach(x => (this.nameOverrideTmp[x.fullDeviceId] = x.deviceName))
    if (config.ipOverride) config.ipOverride.forEach(x => (this.ipOverrideTmp[x.deviceId] = x.deviceIP))
    this.config.nameOverride = this.nameOverrideTmp
    this.config.ipOverride = this.ipOverrideTmp
    this.eveLogPath = this.api.user.storagePath() + '/persist/'

    // *** Set up Homebridge API events *** \\
    this.api
      .on('didFinishLaunching', this.eWeLinkSetup.bind(this))
      .on('shutdown', this.eWeLinkShutdown.bind(this))
  }

  async eWeLinkSetup () {
    try {
      // *** Check to see if the user has disabled the plugin *** \\
      if (this.config.disablePlugin) {
        this.devicesInHB.forEach(a => this.removeAccessory(a))
        this.log.warn('*** Disabling plugin [v%s] ***', this.version)
        this.log.warn('*** To change this, set disablePlugin to false ***')
        return
      }

      // *** Set up initial sync with eWeLink *** \\
      this.log('Plugin [v%s] initialised. Syncing with eWeLink...', this.version)

      // *** Set up the HTTP client, get the user HTTP host, and login *** \\
      this.httpClient = new (require('./connection/http'))(this.config, this.log, this.helpers)
      await this.httpClient.getHost()
      this.authData = await this.httpClient.login()

      // *** Get a device list and add to the devicesInEW map *** \\
      const deviceList = await this.httpClient.getDevices()
      deviceList.forEach(device => this.devicesInEW.set(device.deviceid, device))

      // *** Set up the WS client, get the user WS host, and login *** \\
      this.wsClient = new (require('./connection/ws'))(this.config, this.log, this.helpers, this.authData)
      await this.wsClient.getHost()
      this.wsClient.login()

      // *** Set up the LAN client, scan for devices and start monitoring *** \\
      this.lanClient = new (require('./connection/lan'))(this.config, this.log, this.helpers, deviceList)
      this.lanDevices = await this.lanClient.getHosts()
      await this.lanClient.startMonitor()

      // *** Check for valid Accessory Simulations and add to cusG for later use *** \\
      if (Object.keys(this.config.groups || []).length > 0) {
        this.config.groups
          .filter(g => this.helpers.hasProperty(g, 'type') && this.helpers.allowedGroups.includes(g.type))
          .filter(g => this.helpers.hasProperty(g, 'deviceId') && this.devicesInEW.has(g.deviceId))
          .forEach(g => this.cusG.set(g.deviceId + 'SWX', g))
      }

      // *** Check for valid custom RF Bridge sensors and add to cusS for later use *** \\
      if (Object.keys(this.config.bridgeSensors || []).length > 0) {
        this.config.bridgeSensors
          .filter(s => this.helpers.hasProperty(s, 'deviceId') && this.devicesInEW.has(s.deviceId))
          .forEach(s => this.cusS.set(s.fullDeviceId, s))
      }

      // *** Log for informative purposes *** \\
      this.log('[%s] eWeLink devices loaded from the Homebridge cache.', this.devicesInHB.size)
      this.log('[%s] primary devices loaded from your eWeLink account.', this.devicesInEW.size)

      // *** Remove HB accessories that are no longer in eWeLink account *** \\
      this.devicesInHB.forEach(accessory => {
        if (!this.devicesInEW.has(accessory.context.eweDeviceId)) {
          this.removeAccessory(accessory)
        }
      })

      // *** Initialise each device into HB *** \\
      this.devicesInEW.forEach(device => this.initialiseDevice(device))

      // *** Set up the WS and LAN listener for device updates *** \\
      this.wsClient.receiveUpdate(device => this.receiveDeviceUpdate(device))
      this.lanClient.receiveUpdate(device => this.receiveDeviceUpdate(device))

      // *** Refresh the WS connection every 30 minutes *** \\
      this.wsRefresh = setInterval(async () => {
        try {
          if (this.wsClient) {
            await this.wsClient.getHost()
            await this.wsClient.closeConnection()
            await this.helpers.sleep(250)
            await this.wsClient.login()
          }
        } catch (err) {
          this.log.warn(this.debug ? err : err.message)
        }
      }, 3600000)

      // *** Log for informative purposes *** \\
      this.log("eWeLink sync complete. Don't forget to ⭐️  this plugin on GitHub if you're finding it useful!")
      if (this.config.debugReqRes) {
        this.log.warn("Note: 'Request & Response Logging' is not advised for long-term use.")
      }
    } catch (err) {
      // *** Catch errors at any point during setup *** \\
      this.log.warn('*** Disabling plugin [v%s] ***', this.version)
      this.log.warn(this.debug ? err : err.message)

      // *** Attempt to close WS (and refresh interval) and stop LAN monitor if this has been setup *** \\
      try {
        if (this.lanClient) this.lanClient.closeConnection()
        if (this.wsClient) this.wsClient.closeConnection()
      } catch (err) {
        this.log.warn(this.debug ? err : err.message)
      }
    }
  }

  eWeLinkShutdown () {
    // *** Attempt to close WS (and refresh interval) and stop LAN monitor if this has been setup *** \\
    try {
      if (this.lanClient) this.lanClient.closeConnection()
      if (this.wsClient) this.wsClient.closeConnection()
    } catch (err) {
      this.log.warn(this.debug ? err : err.message)
    }
  }

  initialiseDevice (device) {
    let accessory
    let oAccessory
    try {
      // *** Remove old switch services for new Accessory Simulations *** \\
      if (this.cusG.has(device.deviceid + 'SWX')) {
        const arrToCheck = this.cusG.has(device.deviceid + 'SWX').type === 'switch_valve'
          ? ['0', '1']
          : ['X', '0', '1', '2', '3', '4']
        arrToCheck.forEach(sw => {
          if (this.devicesInHB.has(device.deviceid + 'SW' + sw)) {
            if (this.devicesInHB.get(device.deviceid + 'SW' + sw).getService(this.Service.Switch)) {
              this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SW' + sw))
            }
          }
        })
      }

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
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'blind') {
        /****************************
        BLINDS [ACCESSORY SIMULATION]
        ****************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, this.helpers.defaultBlindCache)
        accessory.control = new (require('./device/blind'))(this, accessory)
        /***************************/
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'garage') {
        /**********************************
        GARAGE DOORS [ONE] [ACCESSORY SIMULATION]
        **********************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, this.helpers.defaultGarageCache)
        accessory.control = new (require('./device/garage'))(this, accessory)
        /*********************************/
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'garage_two') {
        /**********************************
        GARAGE DOORS [TWO] [ACCESSORY SIMULATION]
        **********************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, this.helpers.defaultGarageTwoCache)
        accessory.control = new (require('./device/garage-two'))(this, accessory)
        /*********************************/
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'garage_four') {
        /**********************************
        GARAGE DOORS [FOUR] [ACCESSORY SIMULATION]
        **********************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, this.helpers.defaultGarageFourCache)
        accessory.control = new (require('./device/garage-four'))(this, accessory)
        /*********************************/
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'garage_eachen') {
        /***************************
        GARAGE DOORS [EACHEN GD-DC5]
        ***************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/garage-eachen'))(this, accessory)
        /**************************/
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'lock') {
        /***************************
        LOCKS [ACCESSORY SIMULATION]
        ***************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/lock'))(this, accessory)
        /**************************/
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'switch_valve') {
        /**********************************
        SWITCH-VALVE [ACCESSORY SIMULATION]
        **********************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/switch-valve'))(this, accessory)
        /***************************/
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'valve') {
        /**********************************
        VALVES [ONE] [ACCESSORY SIMULATION]
        **********************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/valve'))(this, accessory)
        /***************************/
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'valve_two') {
        /**********************************
        VALVES [TWO] [ACCESSORY SIMULATION]
        **********************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/valve-two'))(this, accessory)
        /***************************/
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
        /**/
      } else if (this.helpers.devicesThermostat.includes(device.extra.uiid)) {
        /********************
        THERMOSTATS [TH10/16]
        ********************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, {
            sensorType: device.params.sensorType
          })
        accessory.control = (this.config.thAsThermostat || '').split(',').includes(device.deviceid)
          ? new (require('./device/thermostat'))(this, accessory)
          : new (require('./device/outlet-temp'))(this, accessory)
        /*********/
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
        accessory.control = new (require('./device/switch-single'))(this, accessory)
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
            if (i === 0) this.hiddenMasters.push(device.deviceid)
            oAccessory = this.addAccessory(device, device.deviceid + 'SW' + i, true)
          } else {
            oAccessory = this.devicesInHB.has(device.deviceid + 'SW' + i)
              ? this.devicesInHB.get(device.deviceid + 'SW' + i)
              : this.addAccessory(device, device.deviceid + 'SW' + i)
            oAccessory
              .getService(this.Service.AccessoryInformation)
              .setCharacteristic(this.Characteristic.FirmwareRevision, device.params.fwVersion || this.version)
          }
          oAccessory.context.reachableWAN = device.online
          oAccessory.context.reachableLAN = this.lanDevices.has(device.deviceid)
            ? this.lanDevices.get(device.deviceid).online
            : false
          oAccessory.context.eweBrandName = device.brandName
          oAccessory.context.eweShared = this.helpers.hasProperty(device, 'sharedBy') && this.helpers.hasProperty(device.sharedBy, 'email')
            ? device.sharedBy.email
            : false
          oAccessory.context.ip = oAccessory.context.reachableLAN
            ? this.lanDevices.get(device.deviceid).ip
            : false
          oAccessory.control = new (require('./device/switch-multi'))(this, oAccessory)
          this.api.updatePlatformAccessories('homebridge-ewelink', 'eWeLink', [oAccessory])
          this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory)
          if (i === 0) accessory = oAccessory
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
          : this.addAccessory(device, device.deviceid + 'SW0', true, {
            rfMap
          }, 'rf_pri')
        accessory.control = new (require('./device/rf-bridge'))(this, accessory)
        this.hiddenMasters.push(device.deviceid)
        rfMap.forEach(subDevice => {
          const swNumber = rfChlCounter + 1
          let subType
          let sensorTimeLength
          let subExtraContext = {}
          if (['1', '2', '3', '4'].includes(subDevice.type)) {
            subType = 'button'
          } else if (subDevice.type === '6') {
            subType = this.cusS.has(device.deviceid + 'SW' + swNumber)
              ? this.cusS.get(device.deviceid + 'SW' + swNumber).type
              : 'motion'
            if (this.cusS.has(device.deviceid + 'SW' + swNumber)) {
              sensorTimeLength = this.cusS.get(device.deviceid + 'SW' + swNumber).sensorTimeLength
            }
          } else {
            return
          }
          subExtraContext = {
            buttons: subDevice.buttons,
            subType,
            swNumber,
            sensorTimeLength
          }
          if ((oAccessory = this.devicesInHB.get(device.deviceid + 'SW' + swNumber))) {
            if (
              (this.config.resetRFBridge || '').includes(device.deviceid) ||
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
          oAccessory
            .getService(this.Service.AccessoryInformation)
            .setCharacteristic(this.Characteristic.FirmwareRevision, device.params.fwVersion || this.version)
          oAccessory.context.reachableWAN = device.online
          oAccessory.context.reachableLAN = false
          oAccessory.context.eweBrandName = device.brandName
          oAccessory.context.eweShared = this.helpers.hasProperty(device, 'sharedBy') && this.helpers.hasProperty(device.sharedBy, 'email')
            ? device.sharedBy.email
            : false
          oAccessory.context.ip = oAccessory.context.reachableLAN
            ? this.lanDevices.get(device.deviceid).ip
            : false
          this.api.updatePlatformAccessories('homebridge-ewelink', 'eWeLink', [oAccessory])
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
        if (this.devicesInHB.has(device.deviceid + 'SWX')) {
          this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SWX'))
        }
        return
        /***********/
      } else if (this.helpers.devicesZB.includes(device.extra.uiid)) {
        /****************
        ZIGBEE SUBDEVICES
        ****************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/zb-dev'))(this, accessory)
        /***************/
      } else if (this.helpers.devicesCamera.includes(device.extra.uiid)) {
        /******
        CAMERAS
        ******/
        this.log(' → [%s] please see the homebridge-ewelink wiki for details to enable the camera.', device.name)
        return
        /*****/
      } else {
        /**********
        UNSUPPORTED
        **********/
        this.log.warn(' → [%s] has not been added as it is not supported. Please make a GitHub issue request.', device.name)
        return
        /*********/
      }

      // *** Update the current firmware version *** \\
      if (!this.hiddenMasters.includes(device.deviceid)) {
        accessory
          .getService(this.Service.AccessoryInformation)
          .setCharacteristic(this.Characteristic.FirmwareRevision, device.params.fwVersion || this.version)
      }

      // *** Update the reachability values (via WS and LAN) *** \\
      accessory.context.reachableWAN = device.online
      accessory.context.reachableLAN = this.lanDevices.has(device.deviceid)
        ? this.lanDevices.get(device.deviceid).online
        : false
      accessory.context.inUse = false
      accessory.context.eweBrandName = device.brandName
      accessory.context.eweShared = this.helpers.hasProperty(device, 'sharedBy') && this.helpers.hasProperty(device.sharedBy, 'email')
        ? device.sharedBy.email
        : false
      accessory.context.ip = accessory.context.reachableLAN
        ? this.lanDevices.get(device.deviceid).ip
        : false

      // *** Helpful logging for each device *** \\
      let str = accessory.context.reachableLAN
        ? 'and found locally with IP [' + this.lanDevices.get(device.deviceid).ip + ']'
        : 'but LAN mode unavailable as device '
      if (!accessory.context.reachableLAN) {
        if (this.helpers.devicesNonLAN.includes(device.extra.uiid)) {
          str += "doesn't support it"
        } else if (accessory.context.sharedDevice) {
          str += 'is shared (' + device.sharedBy.email + ')'
        } else {
          str += 'is unreachable'
        }
      }

      // *** Update accessory characteristics with latest values *** \\
      if (!this.config.disableHTTPRefresh) accessory.control.externalUpdate(device.params)

      // *** Update any changes to the device into our devicesInHB map *** \\
      this.api.updatePlatformAccessories('homebridge-ewelink', 'eWeLink', [accessory])
      this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
      this.log(' → [%s] initialised %s.', device.name, str)
    } catch (err) {
      // *** Catch errors at any point during device initialisation *** \\
      const deviceName = accessory && this.helpers.hasProperty(accessory, 'displayName')
        ? accessory.displayName
        : device.name
      this.log.warn(' → [%s] could not be initialised as %s.', deviceName, this.debug ? err : err.message)
    }
  }

  addAccessory (device, hbDeviceId, hidden = false, extraContext = {}, type = '') {
    // *** Get the switchNumber which can be {X, 0, 1, 2, 3, 4, ...} *** \\
    const switchNumber = hbDeviceId.split('SW')[1].toString()

    // *** Set up the device name which can depend on the accessory type *** \\
    let newDeviceName = type === 'rf_sub' ? device.tags.zyx_info[switchNumber - 1].name : device.name
    const channelCount = type === 'rf_pri'
      ? Object.keys((device.tags && device.tags.zyx_info) || []).length
      : this.helpers.chansFromUiid[device.extra.uiid]
    if (['1', '2', '3', '4'].includes(switchNumber) && type !== 'rf_sub') {
      if (
        this.helpers.hasProperty(device, 'tags') &&
        this.helpers.hasProperty(device.tags, 'ck_channel_name') &&
        device.tags.ck_channel_name[parseInt(switchNumber) - 1]
      ) {
        newDeviceName = device.tags.ck_channel_name[parseInt(switchNumber) - 1]
      } else {
        newDeviceName += ' SW' + switchNumber
      }
    }
    if (this.helpers.hasProperty(this.config.nameOverride, hbDeviceId)) {
      newDeviceName = this.config.nameOverride[hbDeviceId]
    }

    // *** Add the new accessory to Homebridge *** \\
    try {
      const accessory = new this.api.platformAccessory(newDeviceName, this.api.hap.uuid.generate(hbDeviceId).toString())
      if (!hidden) {
        accessory
          .getService(this.Service.AccessoryInformation)
          .setCharacteristic(this.Characteristic.SerialNumber, hbDeviceId)
          .setCharacteristic(this.Characteristic.Manufacturer, device.brandName)
          .setCharacteristic(this.Characteristic.Model, device.productModel + ' (' + device.extra.model + ')')
          .setCharacteristic(this.Characteristic.FirmwareRevision, device.params.fwVersion || this.version)
          .setCharacteristic(this.Characteristic.Identify, true)
        accessory.on('identify', (paired, callback) => {
          callback()
          this.log('[%s] - identify button pressed.', accessory.displayName)
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
        this.api.registerPlatformAccessories('homebridge-ewelink', 'eWeLink', [accessory])
        this.log(' → [%s] has been added to Homebridge.', newDeviceName)
      }

      // *** Return the new accessory *** \\
      return accessory
    } catch (err) {
      // *** Add helpful context values to the accessory *** \\
      this.log.warn(' → [%s] could not be added as %s.', newDeviceName, err)
      return false
    }
  }

  async sendDeviceUpdate (accessory, params) {
    // *** Add a random delay of [1, 250]ms to avoid multiple http/ws requests a la vez
    await this.helpers.sleep(Math.floor(Math.random() * 250 + 1))

    // *** Set up the payload to send via LAN/WS *** \\
    const payload = {
      apikey: accessory.context.eweApiKey,
      deviceid: accessory.context.eweDeviceId,
      params
    }

    // *** Quick check to see if LAN mode is supported *** \\
    const res = this.config.disableLANMode
      ? 'LAN mode is disabled'
      : this.helpers.devicesNonLAN.includes(accessory.context.eweUIID)
        ? 'LAN mode is not supported for this device'
        : await this.lanClient.sendUpdate(payload)

    // *** Revert to WS if LAN mode not possible for whatever reason *** \\
    if (res !== 'ok') {
      // *** Check to see if the device is online *** \\
      if (accessory.context.reachableWAN) {
        if (this.debug) this.log('[%s] Reverting to web socket as %s.', accessory.displayName, res)
        await this.wsClient.sendUpdate(payload)
      } else {
        throw new Error("it is unreachable. It's status will be corrected once it is reachable")
      }
    }
  }

  async receiveDeviceUpdate (device) {
    const deviceId = device.deviceid
    let accessory
    let reachableChange = false

    // *** Find our accessory for which the updates relates to *** \\
    if ((accessory = this.devicesInHB.get(deviceId + 'SWX') || this.devicesInHB.get(deviceId + 'SW0'))) {
      const isX = accessory.context.hbDeviceId.substr(-1) === 'X'
      if (device.params.updateSource === 'WS') {
        // *** The update is from WS so update the WS online/offline status *** \\
        if (device.params.online !== accessory.context.reachableWAN) {
          accessory.context.reachableWAN = device.params.online
          this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
          reachableChange = true
          this.log.warn('[%s] reported [%sline] via [WS].', accessory.displayName, accessory.context.reachableWAN ? 'on' : 'off')
          if (accessory.context.reachableWAN) {
            try {
              this.wsClient.requestUpdate(accessory)
            } catch (err) {
              this.log.warn('[%s] update could not be requested as %s', accessory.displayName, this.debug ? err.message : err)
            }
          }
        }
      }
      if (device.params.updateSource === 'LAN' && !accessory.context.reachableLAN) {
        // *** The update is from LAN so update the LAN online/offline status *** \\
        accessory.context.reachableLAN = true
        this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
        reachableChange = true
        this.log.warn('[%s] has been reported [online] via [LAN].', accessory.displayName)
        try {
          this.wsClient.requestUpdate(accessory)
        } catch (err) {
          this.log.warn('[%s] update could not be requested as %s', accessory.displayName, this.debug ? err.message : err)
        }
      }

      // *** Update this new online/offline status for all switches of multi channel devices (ie not X) *** \\
      if (reachableChange && !isX) {
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
      if (this.debug) {
        this.log('[%s] %s update received and will be refreshed.', accessory.displayName, device.params.updateSource)
      }
      try {
        // *** Update the accessory with the new data *** \\
        accessory.control.externalUpdate(device.params)
      } catch (err) {
        this.log.warn('[%s] could not be refreshed as %s.', accessory.displayName, this.debug ? err : err.message)
      }
    } else {
      // *** The device does not existing in HB so let's try to add it *** \\
      try {
        // *** Check to see it doesn't exist because it's user hidden *** \\
        if ((this.config.hideDevFromHB || '').includes(deviceId)) return

        // *** Obtain full device information from the HTTP API *** \\
        const newDevice = await this.httpClient.getDevice(deviceId)

        // *** Initialise the device in HB *** \\
        this.initialiseDevice(newDevice)

        // *** Add the device to the LAN client map *** \\
        this.lanClient.addDeviceToMap(newDevice)
      } catch (err) {
        // *** Automatically adding the new device failed for some reason *** \\
        this.log.warn('[%s] restart Homebridge to add new device, failed to add automatically as %s.', deviceId, err.message)
      }
    }
  }

  async deviceUpdateError (accessory, err, requestRefresh) {
    this.log.warn('[%s] could not be updated as %s.', accessory.displayName, this.debug ? err : err.message)

    // *** We only request a device refresh on failed internal updates (ie with 'set' handlers) *** \\
    if (requestRefresh) {
      if (accessory.context.reachableWAN) {
        try {
          await this.wsClient.requestUpdate(accessory)
          this.log.warn('[%s] requesting previous state to revert Homebridge state.', accessory.displayName)
        } catch (err) {}
      } else {
        this.log.warn('[%s] Homebridge state will be synced once the device comes back online.', accessory.displayName)
      }
    }
  }

  configureAccessory (accessory) {
    // *** Function is called for each device on HB start *** \\
    if (!this.log) return

    // *** Add each cached device to our devicesInHB map *** \\
    this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
  }

  removeAccessory (accessory) {
    try {
      // *** Unregister the accessory from HB and remove it from our devicesInHB map *** \\
      this.api.unregisterPlatformAccessories('homebridge-ewelink', 'eWeLink', [accessory])
      this.devicesInHB.delete(accessory.context.hbDeviceId)
      this.log(' → [%s] was removed from Homebridge.', accessory.displayName)
    } catch (err) {
      this.log.warn(" → [%s] wasn't removed as %s.", accessory.displayName, err)
    }
  }
}

module.exports = hb => hb.registerPlatform('homebridge-ewelink', 'eWeLink', eWeLinkPlatform)
