/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const DeviceCurtain = require('./device/curtain')
const DeviceBlind = require('./device/blind')
const DeviceGarage = require('./device/garage')
const DeviceGarageTwo = require('./device/garage-two')
const DeviceGarageEachen = require('./device/garage-eachen')
const DeviceLock = require('./device/lock')
const DeviceValve = require('./device/valve')
const DeviceSensor = require('./device/sensor')
const DeviceFan = require('./device/fan')
const DeviceThermostat = require('./device/thermostat')
const DeviceOutlet = require('./device/outlet')
const DeviceUSB = require('./device/usb')
const DeviceSCM = require('./device/scm')
const DeviceLight = require('./device/light')
const DeviceSwitch = require('./device/switch')
const DeviceRFBridge = require('./device/rf-bridge')
const DeviceZBDev = require('./device/zb-dev')
const EWeLinkHTTP = require('./ewelink-http')
const EWeLinkLAN = require('./ewelink-lan')
const EWeLinkWS = require('./ewelink-ws')
const helpers = require('./helpers')
const promInterval = require('interval-promise')
module.exports = class eWeLinkPlatform {
  constructor (log, config, api) {
    if (!log || !api || !config) return
    if (!config.username || !config.password || !config.countryCode) {
      log.error('************* Cannot load homebridge-ewelink *************')
      log.error('*** eWeLink credentials missing from Homebridge config ***')
      return
    }
    this.log = log
    this.config = config
    this.api = api
    this.Characteristic = api.hap.Characteristic
    this.Service = api.hap.Service
    this.debug = this.config.debug || false
    this.devicesInHB = new Map()
    this.devicesInEW = new Map()
    this.cusG = new Map()
    this.cusS = new Map()
    this.hiddenMasters = []
    this.eveLogPath = this.api.user.storagePath() + '/homebridge-ewelink/'
    this.wsRefreshFlag = true
    this.nameOverrideTmp = {}
    this.ipOverrideTmp = {}
    if (this.config.nameOverride) this.config.nameOverride.forEach(x => (this.nameOverrideTmp[x.fullDeviceId] = x.deviceName))
    if (this.config.ipOverride) this.config.ipOverride.forEach(x => (this.ipOverrideTmp[x.deviceId] = x.deviceIP))
    this.config.nameOverride = this.nameOverrideTmp
    this.config.ipOverride = this.ipOverrideTmp
    //* ** UPGRADE **\\
    this.config.hideChanFromHB += this.config.hideMasters + ',' + this.config.hideFromHB
    //* *************\\
    this.api
      .on('didFinishLaunching', () => this.eWeLinkSetup())
      .on('shutdown', () => this.eWeLinkShutdown())
  }

  async eWeLinkSetup () {
    try {
      if (this.config.disablePlugin) {
        this.devicesInHB.forEach(a => this.removeAccessory(a))
        this.log.warn('********* Not loading homebridge-ewelink *********')
        this.log.warn('*** To change this, set disablePlugin to false ***')
        return
      }
      this.log('Plugin has finished initialising. Syncing with eWeLink.')
      this.httpClient = new EWeLinkHTTP(this.config, this.log)
      await this.httpClient.getHost()
      this.authData = await this.httpClient.login()
      const deviceList = await this.httpClient.getDevices()
      deviceList.forEach(device => this.devicesInEW.set(device.deviceid, device))
      this.wsClient = new EWeLinkWS(this.config, this.log, this.authData)
      this.lanClient = new EWeLinkLAN(this.config, this.log, deviceList)
      await this.wsClient.getHost()
      this.wsClient.login()
      this.lanDevices = await this.lanClient.getHosts()
      await this.lanClient.startMonitor()
      ;(() => {
        if (Object.keys(this.config.groups || []).length > 0) {
          this.config.groups
            .filter(g => helpers.hasProperty(g, 'type') && helpers.allowedGroups.includes(g.type))
            .filter(g => helpers.hasProperty(g, 'deviceId') && this.devicesInEW.has(g.deviceId))
            .forEach(g => this.cusG.set(g.deviceId + 'SWX', g))
        }
        if (Object.keys(this.config.bridgeSensors || []).length > 0) {
          this.config.bridgeSensors
            .filter(s => helpers.hasProperty(s, 'deviceId') && this.devicesInEW.has(s.deviceId))
            .forEach(s => this.cusS.set(s.fullDeviceId, s))
        }
        this.log('[%s] eWeLink devices loaded from the Homebridge cache.', this.devicesInHB.size)
        this.log('[%s] primary devices loaded from your eWeLink account.', this.devicesInEW.size)
        this.devicesInHB.forEach(a => {
          if (!this.devicesInEW.has(a.context.eweDeviceId)) this.removeAccessory(a)
        })
        this.devicesInEW.forEach(d => this.initialiseDevice(d))
        this.wsClient.receiveUpdate(d => this.receiveDeviceUpdate(d))
        this.lanClient.receiveUpdate(d => this.receiveDeviceUpdate(d))
        this.wsRefresh = promInterval(
          async () => {
            if (this.wsRefreshFlag) {
              try {
                if (this.wsClient) {
                  await this.wsClient.getHost()
                  await this.wsClient.closeConnection()
                  await helpers.sleep(250)
                  await this.wsClient.login()
                }
              } catch (err) {
                this.log.warn(this.debug ? err : err.message)
              }
            }
          }, 1800000, { stopOnError: false }
        )
        this.log("eWeLink sync complete. Don't forget to ⭐️  this plugin on GitHub if you're finding it useful!")
        if (this.config.debugReqRes) {
          this.log.warn("Note: 'Request & Response Logging' is not advised for long-term use.")
        }
      })()
    } catch (err) {
      this.log.error('************* Cannot load homebridge-ewelink *************')
      this.log.error(this.debug ? err : err.message)
      try {
        if (this.lanClient) this.lanClient.closeConnection()
        if (this.wsClient) this.wsClient.closeConnection()
      } catch (err) {
        this.log.warn(this.debug ? err : err.message)
      }
      this.wsRefreshFlag = false
    }
  }

  eWeLinkShutdown () {
    try {
      if (this.lanClient) this.lanClient.closeConnection()
      if (this.wsClient) this.wsClient.closeConnection()
    } catch (err) {
      this.log.warn(this.debug ? err : err.message)
    }
    this.wsRefreshFlag = false
  }

  initialiseDevice (device) {
    let accessory
    let oAccessory
    try {
      if (this.cusG.has(device.deviceid + 'SWX')) {
        ;['X', '0', '1', '2', '3', '4'].forEach(sw => {
          if (this.devicesInHB.has(device.deviceid + 'SW' + sw)) {
            if (this.devicesInHB.get(device.deviceid + 'SW' + sw).getService(this.Service.Switch)) {
              this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SW' + sw))
            }
          }
        })
      }
      if (helpers.devicesCurtain.includes(device.extra.uiid)) {
        /***********************
        BLINDS [EWELINK UIID 11]
        ***********************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, helpers.defaultCurtainCache)
        accessory.control = new DeviceCurtain(this, accessory)
        /**********************/
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'blind') {
        /****************************
        BLINDS [ACCESSORY SIMULATION]
        ****************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, helpers.defaultBlindCache)
        accessory.control = new DeviceBlind(this, accessory)
        /***************************/
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'garage') {
        /**********************************
        GARAGE DOORS [ONE] [ACCESSORY SIMULATION]
        **********************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, helpers.defaultGarageCache)
        accessory.control = new DeviceGarage(this, accessory)
        /*********************************/
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'garage_two') {
        /**********************************
        GARAGE DOORS [TWO] [ACCESSORY SIMULATION]
        **********************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, helpers.defaultGarageTwoCache)
        accessory.control = new DeviceGarageTwo(this, accessory)
        /*********************************/
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'garage_eachen') {
        /***************************
        GARAGE DOORS [EACHEN GD-DC5]
        ***************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceGarageEachen(this, accessory)
        /**************************/
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'lock') {
        /***************************
        LOCKS [ACCESSORY SIMULATION]
        ***************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceLock(this, accessory)
        /**************************/
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'valve') {
        /****************************
        VALVES [ACCESSORY SIMULATION]
        ****************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceValve(this, accessory)
        /***************************/
      } else if (helpers.devicesSensor.includes(device.extra.uiid)) {
        /*******************
        SENSORS [SONOFF DW2]
        *******************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, { type: 'sensor' })
        accessory.control = new DeviceSensor(this, accessory)
        /******************/
      } else if (helpers.devicesFan.includes(device.extra.uiid)) {
        /***
        FANS
        ***/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceFan(this, accessory)
        /**/
      } else if (helpers.devicesThermostat.includes(device.extra.uiid)) {
        /**********
        THERMOSTATS
        **********/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, {
            sensorType: device.params.sensorType
          })
        accessory.control = new DeviceThermostat(this, accessory)
        /*********/
      } else if (helpers.devicesOutlet.includes(device.extra.uiid) || (helpers.devicesSingleSwitch.includes(device.extra.uiid) && helpers.devicesSingleSwitchOutlet.includes(device.productModel))) {
        /******
        OUTLETS
        ******/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceOutlet(this, accessory)
        /*****/
      } else if (helpers.devicesUSB.includes(device.extra.uiid)) {
        /**********
        USB OUTLETS
        **********/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceUSB(this, accessory)
        /*********/
      } else if (helpers.devicesSCM.includes(device.extra.uiid)) {
        /*********************************
        SINGLE CHL [MULTIPLE CHL HARDWARE]
        *********************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceSCM(this, accessory)
        /********************************/
      } else if (helpers.devicesSingleSwitch.includes(device.extra.uiid) && helpers.devicesSingleSwitchLight.includes(device.productModel)) {
        /**********************
        LIGHTS [SINGLE CHANNEL]
        **********************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceLight(this, accessory)
        /*********************/
      } else if (helpers.devicesMultiSwitch.includes(device.extra.uiid) && helpers.devicesMultiSwitchLight.includes(device.productModel)) {
        /*********************
        LIGHTS [MULTI CHANNEL]
        *********************/
        if ((this.config.hideChanFromHB || '').split(',').includes(device.deviceid + 'SW0')) {
          if (this.devicesInHB.has(device.deviceid + 'SW0')) {
            this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SW0'))
          }
          this.hiddenMasters.push(device.deviceid)
          accessory = this.addAccessory(device, device.deviceid + 'SW0', true)
        } else {
          accessory = this.devicesInHB.has(device.deviceid + 'SW0')
            ? this.devicesInHB.get(device.deviceid + 'SW0')
            : this.addAccessory(device, device.deviceid + 'SW0')
        }
        accessory.control = new DeviceLight(this, accessory)
        for (let i = 1; i <= helpers.chansFromUiid[device.extra.uiid]; i++) {
          if ((this.config.hideChanFromHB || '').split(',').includes(device.deviceid + 'SW' + i)) {
            if (this.devicesInHB.has(device.deviceid + 'SW' + i)) {
              this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SW' + i))
            }
            oAccessory = this.addAccessory(device, device.deviceid + 'SW' + i, true)
          } else {
            oAccessory = this.devicesInHB.has(device.deviceid + 'SW' + i)
              ? this.devicesInHB.get(device.deviceid + 'SW' + i)
              : this.addAccessory(device, device.deviceid + 'SW' + i)
            oAccessory
              .getService(this.Service.AccessoryInformation)
              .setCharacteristic(this.Characteristic.FirmwareRevision, device.params.fwVersion)
          }
          oAccessory.context.reachableWAN = device.online
          oAccessory.context.reachableLAN = this.lanDevices.get(device.deviceid).online || false
          this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory)
          oAccessory.control = new DeviceLight(this, oAccessory)
        }
        /********************/
      } else if (helpers.devicesSingleSwitch.includes(device.extra.uiid)) {
        /************************
        SWITCHES [SINGLE CHANNEL]
        ************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceSwitch(this, accessory)
        /***********************/
      } else if (helpers.devicesMultiSwitch.includes(device.extra.uiid)) {
        /***********************
        SWITCHES [MULTI CHANNEL]
        ***********************/
        if ((this.config.hideChanFromHB || '').split(',').includes(device.deviceid + 'SW0')) {
          if (this.devicesInHB.has(device.deviceid + 'SW0')) {
            this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SW0'))
          }
          this.hiddenMasters.push(device.deviceid)
          accessory = this.addAccessory(device, device.deviceid + 'SW0', true)
        } else {
          accessory = this.devicesInHB.has(device.deviceid + 'SW0')
            ? this.devicesInHB.get(device.deviceid + 'SW0')
            : this.addAccessory(device, device.deviceid + 'SW0')
        }
        accessory.control = new DeviceSwitch(this, accessory)
        for (let i = 1; i <= helpers.chansFromUiid[device.extra.uiid]; i++) {
          if ((this.config.hideChanFromHB || '').split(',').includes(device.deviceid + 'SW' + i)) {
            if (this.devicesInHB.has(device.deviceid + 'SW' + i)) {
              this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SW' + i))
            }
            oAccessory = this.addAccessory(device, device.deviceid + 'SW' + i, true)
          } else {
            oAccessory = this.devicesInHB.has(device.deviceid + 'SW' + i)
              ? this.devicesInHB.get(device.deviceid + 'SW' + i)
              : this.addAccessory(device, device.deviceid + 'SW' + i)
            oAccessory
              .getService(this.Service.AccessoryInformation)
              .setCharacteristic(this.Characteristic.FirmwareRevision, device.params.fwVersion)
          }
          oAccessory.context.reachableWAN = device.online
          oAccessory.context.reachableLAN = this.lanDevices.get(device.deviceid).online || false
          this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory)
          oAccessory.control = new DeviceSwitch(this, oAccessory)
        }
        /**********************/
      } else if (helpers.devicesRFBridge.includes(device.extra.uiid)) {
        /*********************
        RF BRIDGE + SUBDEVICES
        *********************/
        let rfChlCounter = 0
        const rfMap = []
        if (helpers.hasProperty(device, 'tags') && helpers.hasProperty(device.tags, 'zyx_info')) {
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
        accessory.control = new DeviceRFBridge(this, accessory)
        this.hiddenMasters.push(device.deviceid)
        rfMap.forEach(subDevice => {
          const swNumber = rfChlCounter + 1
          let subType
          let subExtraContext = {}
          if (['1', '2', '3', '4'].includes(subDevice.type)) {
            subType = 'button'
          } else if (subDevice.type === '6') {
            subType = this.cusS.has(device.deviceid + 'SW' + swNumber)
              ? this.cusS.get(device.deviceid + 'SW' + swNumber).type
              : 'motion'
          } else {
            return
          }
          subExtraContext = {
            buttons: subDevice.buttons,
            subType,
            swNumber
          }
          if ((oAccessory = this.devicesInHB.get(device.deviceid + 'SW' + swNumber))) {
            if (oAccessory.context.subType !== subType || oAccessory.context.swNumber !== swNumber) {
              this.removeAccessory(oAccessory)
            }
          }
          oAccessory = this.devicesInHB.has(device.deviceid + 'SW' + swNumber)
            ? this.devicesInHB.get(device.deviceid + 'SW' + swNumber)
            : this.addAccessory(device, device.deviceid + 'SW' + swNumber, false, subExtraContext, 'rf_sub')
          oAccessory
            .getService(this.Service.AccessoryInformation)
            .setCharacteristic(this.Characteristic.FirmwareRevision, device.params.fwVersion)
          oAccessory.context.reachableWAN = device.online
          oAccessory.context.reachableLAN = false
          this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory)
          oAccessory.control = new DeviceRFBridge(this, oAccessory)
          rfChlCounter += Object.keys(subDevice.buttons || {}).length
        })
        accessory.context.channelCount = rfChlCounter
        this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
        /********************/
      } else if (helpers.devicesZBBridge.includes(device.extra.uiid)) {
        /************
        ZIGBEE BRIDGE
        ************/
        if (this.devicesInHB.has(device.deviceid + 'SWX')) {
          this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SWX'))
        }
        return
        /***********/
      } else if (helpers.devicesZB.includes(device.extra.uiid)) {
        /****************
        ZIGBEE SUBDEVICES
        ****************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceZBDev(this, accessory)
        /***************/
      } else if (helpers.devicesCamera.includes(device.extra.uiid)) {
        /******
        CAMERAS
        ******/
        this.log.warn(' → [%s] please see the homebridge-ewelink wiki for details to enable the camera.', device.name)
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
      if (!this.hiddenMasters.includes(device.deviceid)) {
        accessory
          .getService(this.Service.AccessoryInformation)
          .setCharacteristic(this.Characteristic.FirmwareRevision, device.params.fwVersion)
      }
      accessory.context.reachableWAN = device.online
      accessory.context.reachableLAN = this.lanDevices.has(device.deviceid)
        ? this.lanDevices.get(device.deviceid).online
        : false
      accessory.context.inUse = false
      let str = accessory.context.reachableLAN
        ? 'and found locally with IP [' + this.lanDevices.get(device.deviceid).ip + ']'
        : 'but LAN mode unavailable as device '
      if (!accessory.context.reachableLAN) {
        if (helpers.devicesNonLAN.includes(device.extra.uiid)) {
          str += "doesn't support it"
        } else if (helpers.hasProperty(device, 'sharedBy') && helpers.hasProperty(device.sharedBy, 'email')) {
          str += 'is shared (' + device.sharedBy.email + ')'
        } else {
          str += 'is unreachable'
        }
      }
      if (!this.config.disableHTTPRefresh) accessory.control.externalUpdate(device.params)
      this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
      this.log(' → [%s] initialised %s.', device.name, str)
    } catch (err) {
      const deviceName = accessory && helpers.hasProperty(accessory, 'displayName')
        ? accessory.displayName
        : device.name
      this.log.warn(' → [%s] could not be initialised as %s.', deviceName, this.debug ? err : err.message)
    }
  }

  addAccessory (device, hbDeviceId, hidden = false, extraContext = {}, type = '') {
    const switchNumber = hbDeviceId.substr(-1).toString()
    let newDeviceName = type === 'rf_sub' ? device.tags.zyx_info[switchNumber - 1].name : device.name
    const channelCount =
      type === 'rf_pri'
        ? Object.keys((device.tags && device.tags.zyx_info) || []).length
        : helpers.chansFromUiid[device.extra.uiid]
    if (['1', '2', '3', '4'].includes(switchNumber) && type !== 'rf_sub') {
      newDeviceName += ' SW' + switchNumber
    }
    if (helpers.hasProperty(this.config.nameOverride, hbDeviceId)) {
      newDeviceName = this.config.nameOverride[hbDeviceId]
    }
    try {
      const accessory = new this.api.platformAccessory(newDeviceName, this.api.hap.uuid.generate(hbDeviceId).toString())
      if (!hidden) {
        accessory
          .getService(this.Service.AccessoryInformation)
          .setCharacteristic(this.Characteristic.SerialNumber, hbDeviceId)
          .setCharacteristic(this.Characteristic.Manufacturer, device.brandName)
          .setCharacteristic(this.Characteristic.Model, device.productModel + ' (' + device.extra.model + ')')
          .setCharacteristic(this.Characteristic.FirmwareRevision, device.params.fwVersion)
          .setCharacteristic(this.Characteristic.Identify, false)
      }
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
      if (!hidden) {
        this.api.registerPlatformAccessories('homebridge-ewelink', 'eWeLink', [accessory])
        this.log(' → [%s] has been added to Homebridge.', newDeviceName)
      }
      return accessory
    } catch (err) {
      this.log.warn(' → [%s] could not be added as %s.', newDeviceName, err)
      return false
    }
  }

  async sendDeviceUpdate (accessory, params) {
    const payload = {
      apikey: accessory.context.eweApiKey,
      deviceid: accessory.context.eweDeviceId,
      params
    }
    let res
    if (helpers.devicesNonLAN.includes(accessory.context.eweUIID)) {
      res = "device doesn't support LAN mode"
    } else {
      res = await this.lanClient.sendUpdate(payload)
    }
    if (res !== 'ok') {
      if (accessory.context.reachableWAN) {
        if (this.debug) {
          this.log('[%s] Reverting to web socket as %s.', accessory.displayName, res)
        }
        await this.wsClient.sendUpdate(payload)
      } else {
        throw new Error("it is unreachable. It's status will be corrected once it is reachable")
      }
    }
  }

  async receiveDeviceUpdate (device) {
    let accessory
    const deviceId = device.deviceid
    let reachableChange = false
    if ((accessory = this.devicesInHB.get(deviceId + 'SWX') || this.devicesInHB.get(deviceId + 'SW0'))) {
      const isX = accessory.context.hbDeviceId.substr(-1) === 'X'
      if (device.params.updateSource === 'WS') {
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
      if (reachableChange && !isX) {
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
        accessory.control.externalUpdate(device.params)
      } catch (err) {
        this.log.warn('[%s] could not be refreshed as %s.', accessory.displayName, this.debug ? err : err.message)
      }
    } else {
      try {
        if (!(this.config.hideDevFromHB || '').includes(deviceId)) {
          this.log.warn('[%s] %s update received for new device which will be added.', deviceId, device.params.updateSource)
          const newDevice = await this.httpClient.getDevice(deviceId)
          this.initialiseDevice(newDevice)
          this.lanClient.addDeviceToMap(newDevice)
        }
      } catch (err) {
        this.log.warn('[%s] error getting info [%s]. Restart Homebridge to add device.', deviceId, err.message)
      }
    }
  }

  async deviceUpdateError (accessory, err, requestRefresh) {
    this.log.warn('[%s] could not be updated as %s.', accessory.displayName, this.debug ? err : err.message)
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
    if (!this.log) return
    this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
  }

  removeAccessory (accessory) {
    try {
      this.api.unregisterPlatformAccessories('homebridge-ewelink', 'eWeLink', [accessory])
      this.devicesInHB.delete(accessory.context.hbDeviceId)
      this.log(' → [%s] was removed from Homebridge.', accessory.displayName)
    } catch (err) {
      this.log.warn(" → [%s] wasn't removed as %s.", accessory.displayName, err)
    }
  }
}
