'use strict'
let Accessory, Characteristic, EveService, EveHistoryService, Service
const cns = require('./constants')
const corrInterval = require('correcting-interval')
const DeviceCurtain = require('./device/curtain')
const DeviceBlind = require('./device/blind')
const DeviceGarage = require('./device/garage')
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
const DeviceRFSub = require('./device/rf-sub')
const DeviceZBDev = require('./device/zb-dev')
const EWeLinkHTTP = require('./eWeLinkHTTP')
const EWeLinkWS = require('./eWeLinkWS')
const EWeLinkLAN = require('./eWeLinkLAN')
const fakegato = require('fakegato-history')
const hbLib = require('homebridge-lib')
const promInterval = require('interval-promise')
const utils = require('./utils')
class eWeLink {
  constructor (log, config, api) {
    if (!log || !api || !config) return
    if (!config.username || !config.password || !config.countryCode) {
      log.error('*********** Cannot load homebridge-ewelink ************')
      log.error('eWeLink credentials missing from the Homebridge config.')
      log.error('*******************************************************')
      return
    }
    this.log = log
    this.config = config
    this.api = api
    this.debug = this.config.debug || false
    this.devicesInHB = new Map()
    this.devicesInEW = new Map()
    this.cusG = new Map()
    this.cusS = new Map()
    this.hiddenMasters = []
    this.eveLogPath = this.api.user.storagePath() + '/homebridge-ewelink/'
    this.wsRefreshFlag = true
    this.api
      .on('didFinishLaunching', () => this.eWeLinkSync())
      .on('shutdown', () => {
        if (this.lanClient) this.lanClient.closeConnection()
        if (this.wsClient) this.wsClient.closeConnection()
        this.wsRefreshFlag = false
      })
  }

  async eWeLinkSync () {
    try {
      this.log('Plugin has finished initialising. Synching with eWeLink.')
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
      await this.lanClient.startMonitor();
      (() => {
        //* ** Make a map of custom groups from Homebridge config ***\\
        if (Object.keys(this.config.groups || []).length > 0) {
          this.config.groups
            .filter(g => Object.prototype.hasOwnProperty.call(g, 'type') && cns.allowedGroups.includes(g.type))
            .filter(g => Object.prototype.hasOwnProperty.call(g, 'deviceId') && this.devicesInEW.has(g.deviceId))
            .forEach(g => this.cusG.set(g.deviceId + 'SWX', g))
        }
        //* ** Make a map of RF Bridge custom sensors from Homebridge config ***\\
        if (Object.keys(this.config.bridgeSensors || []).length > 0) {
          this.config.bridgeSensors
            .filter(s => Object.prototype.hasOwnProperty.call(s, 'deviceId') && this.devicesInEW.has(s.deviceId))
            .forEach(s => this.cusS.set(s.fullDeviceId, s))
        }
        //* ** Logging always helps to see if everything is okay so far ***\\
        this.log('[%s] eWeLink devices loaded from the Homebridge cache.', this.devicesInHB.size)
        this.log('[%s] primary devices loaded from your eWeLink account.', this.devicesInEW.size)
        //* ** Remove Homebridge accessories that don't appear in eWeLink ***\\
        this.devicesInHB.forEach(a => {
          if (!this.devicesInEW.has(a.context.eweDeviceId)) {
            this.removeAccessory(a)
          }
        })
        //* ** Synchronise devices between eWeLink and Homebridge and set up WS/LAN listeners ***\\
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
                  await utils.sleep(250)
                  await this.wsClient.login()
                }
              } catch (err) {
                this.log.warn(err)
              }
            }
          },
          1800000, {
            stopOnError: false
          }
        )
        this.log("eWeLink sync complete. Don't forget to ⭐️  this plugin on GitHub!")
        if (this.config.debugReqRes || false) {
          this.log.warn("Note: 'Request & Response Logging' is not advised for long-term use.")
        }
      })()
    } catch (err) {
      this.log.error('************** Cannot load homebridge-ewelink **************')
      this.log.error(this.debug ? err : err.message)
      this.log.error('************************************************************')
      if (this.lanClient) this.lanClient.closeConnection()
      if (this.wsClient) this.wsClient.closeConnection()
      this.wsRefreshFlag = false
    }
  }

  initialiseDevice (device) {
    let accessory
    //* ** CURTAINS ***\\
    if (cns.devicesCurtain.includes(device.extra.uiid)) {
      accessory = this.devicesInHB.has(device.deviceid + 'SWX')
        ? this.devicesInHB.get(device.deviceid + 'SWX')
        : this.addAccessory(device, device.deviceid + 'SWX', 'curtain', false, {
          cacheCurrentPosition: 0
        })
      //* ** @UPGRADE from v2 -> v3  23.09.2020 ***\\
      if (Object.prototype.hasOwnProperty.call(accessory.context, 'prevPos')) {
        accessory.context.cacheCurrentPosition = accessory.context.prevPos
        delete accessory.context.prevPos
        //* ** @ENDUPGRADE ***\\
      }
      if (!Object.prototype.hasOwnProperty.call(accessory.context, 'cacheCurrentPosition')) {
        accessory.context.cacheCurrentPosition = 0
        //* ** @ENDUPGRADE ***\\
      }
    } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'blind') {
      accessory = this.devicesInHB.has(device.deviceid + 'SWX')
        ? this.devicesInHB.get(device.deviceid + 'SWX')
        : this.addAccessory(device, device.deviceid + 'SWX', 'blind', false, {
          cacheCurrentPosition: 0,
          cachePositionState: 2,
          cacheTargetPosition: 0
        })
      //* ** @UPGRADE from v2 -> v3  23.09.2020 ***\\
      if (!Object.prototype.hasOwnProperty.call(accessory.context, 'cacheCurrentPosition')) {
        accessory.context.cacheCurrentPosition = 0
        accessory.context.cachePositionState = 2
        accessory.context.cacheTargetPosition = 0
      }
      //* ** @ENDUPGRADE ***\\
    } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'garage') {
      accessory = this.devicesInHB.has(device.deviceid + 'SWX')
        ? this.devicesInHB.get(device.deviceid + 'SWX')
        : this.addAccessory(device, device.deviceid + 'SWX', 'garage', false, {
          cacheCurrentDoorState: 1,
          cacheTargetDoorState: 1
        })
      //* ** @UPGRADE from v2 -> v3  23.09.2020 ***\\
      if (!Object.prototype.hasOwnProperty.call(accessory.context, 'cacheCurrentDoorState')) {
        accessory.context.cacheCurrentDoorState = 1
        accessory.context.cacheTargetDoorState = 1
      }
      //* ** @ENDUPGRADE ***\\
    } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'lock') {
      accessory = this.devicesInHB.has(device.deviceid + 'SWX')
        ? this.devicesInHB.get(device.deviceid + 'SWX')
        : this.addAccessory(device, device.deviceid + 'SWX', 'lock')
    } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'valve') {
      accessory = this.devicesInHB.has(device.deviceid + 'SWX')
        ? this.devicesInHB.get(device.deviceid + 'SWX')
        : this.addAccessory(device, device.deviceid + 'SWX', 'valve')
    } else if (cns.devicesSensor.includes(device.extra.uiid)) {
      accessory = this.devicesInHB.has(device.deviceid + 'SWX')
        ? this.devicesInHB.get(device.deviceid + 'SWX')
        : this.addAccessory(device, device.deviceid + 'SWX', 'sensor')
    } else if (cns.devicesFan.includes(device.extra.uiid)) {
      accessory = this.devicesInHB.has(device.deviceid + 'SWX')
        ? this.devicesInHB.get(device.deviceid + 'SWX')
        : this.addAccessory(device, device.deviceid + 'SWX', 'fan')
    } else if (cns.devicesThermostat.includes(device.extra.uiid)) {
      accessory = this.devicesInHB.has(device.deviceid + 'SWX')
        ? this.devicesInHB.get(device.deviceid + 'SWX')
        : this.addAccessory(device, device.deviceid + 'SWX', 'thermostat', false, {
          sensorType: device.params.sensorType
        })
      //* ** @UPGRADE from v2 -> v3  23.09.2020 ***\\
      if (!Object.prototype.hasOwnProperty.call(accessory.context, 'sensorType')) {
        accessory.context.sensorType = device.params.sensorType
      }
      if (accessory.context.sensorType === 'DS18B20') {
        if (accessory.getService(Service.HumiditySensor)) {
          accessory.removeService(Service.HumiditySensor)
        }
      }
      //* ** @ENDUPGRADE ***\\
      if (accessory.context.sensorType !== device.params.sensorType) {
        accessory.context.sensorType = device.params.sensorType
        this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
      }
    } else if (
      cns.devicesOutlet.includes(device.extra.uiid) ||
      (cns.devicesSingleSwitch.includes(device.extra.uiid) &&
        cns.devicesSingleSwitchOutlet.includes(device.productModel))
    ) {
      accessory = this.devicesInHB.has(device.deviceid + 'SWX')
        ? this.devicesInHB.get(device.deviceid + 'SWX')
        : this.addAccessory(device, device.deviceid + 'SWX', 'outlet')
    } else if (cns.devicesUSB.includes(device.extra.uiid)) {
      accessory = this.devicesInHB.has(device.deviceid + 'SWX')
        ? this.devicesInHB.get(device.deviceid + 'SWX')
        : this.addAccessory(device, device.deviceid + 'SWX', 'usb')
    } else if (cns.devicesSCM.includes(device.extra.uiid)) {
      accessory = this.devicesInHB.has(device.deviceid + 'SWX')
        ? this.devicesInHB.get(device.deviceid + 'SWX')
        : this.addAccessory(device, device.deviceid + 'SWX', 'scm')
    } else if (
      cns.devicesSingleSwitch.includes(device.extra.uiid) &&
      cns.devicesSingleSwitchLight.includes(device.productModel)
    ) {
      accessory = this.devicesInHB.has(device.deviceid + 'SWX')
        ? this.devicesInHB.get(device.deviceid + 'SWX')
        : this.addAccessory(device, device.deviceid + 'SWX', 'light')
    } else if (
      cns.devicesMultiSwitch.includes(device.extra.uiid) &&
      cns.devicesMultiSwitchLight.includes(device.productModel)
    ) {
      if (this.config.hideMasters) {
        if (this.devicesInHB.has(device.deviceid + 'SW0')) {
          this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SW0'))
        }
        this.hiddenMasters.push(device.deviceid)
        accessory = this.addAccessory(device, device.deviceid + 'SW0', 'light', true)
      } else {
        accessory = this.devicesInHB.has(device.deviceid + 'SW0')
          ? this.devicesInHB.get(device.deviceid + 'SW0')
          : this.addAccessory(device, device.deviceid + 'SW0', 'light')
      }
      for (let i = 1; i <= cns.chansFromUiid[device.extra.uiid]; i++) {
        if ((this.config.hideFromHB || '').includes(device.deviceid + 'SW' + i)) {
          if (this.devicesInHB.has(device.deviceid + 'SW' + i)) {
            this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SW' + i))
          }
        } else {
          const oAccessory = this.devicesInHB.has(device.deviceid + 'SW' + i)
            ? this.devicesInHB.get(device.deviceid + 'SW' + i)
            : this.addAccessory(device, device.deviceid + 'SW' + i, 'light')
          oAccessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.FirmwareRevision, device.params.fwVersion)
          oAccessory.context.reachableWAN = device.online
          oAccessory.context.reachableLAN = this.lanDevices.get(device.deviceid).online || false
          this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory)
        }
      }
    } else if (cns.devicesSingleSwitch.includes(device.extra.uiid)) {
      accessory = this.devicesInHB.has(device.deviceid + 'SWX')
        ? this.devicesInHB.get(device.deviceid + 'SWX')
        : this.addAccessory(device, device.deviceid + 'SWX', 'switch')
    } else if (cns.devicesMultiSwitch.includes(device.extra.uiid)) {
      if (this.config.hideMasters) {
        if (this.devicesInHB.has(device.deviceid + 'SW0')) {
          this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SW0'))
        }
        this.hiddenMasters.push(device.deviceid)
        accessory = this.addAccessory(device, device.deviceid + 'SW0', 'switch', true)
      } else {
        accessory = this.devicesInHB.has(device.deviceid + 'SW0')
          ? this.devicesInHB.get(device.deviceid + 'SW0')
          : this.addAccessory(device, device.deviceid + 'SW0', 'switch')
      }
      for (let i = 1; i <= cns.chansFromUiid[device.extra.uiid]; i++) {
        if ((this.config.hideFromHB || '').includes(device.deviceid + 'SW' + i)) {
          if (this.devicesInHB.has(device.deviceid + 'SW' + i)) {
            this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SW' + i))
          }
        } else {
          const oAccessory = this.devicesInHB.has(device.deviceid + 'SW' + i)
            ? this.devicesInHB.get(device.deviceid + 'SW' + i)
            : this.addAccessory(device, device.deviceid + 'SW' + i, 'switch')
          oAccessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.FirmwareRevision, device.params.fwVersion)
          oAccessory.context.reachableWAN = device.online
          oAccessory.context.reachableLAN = this.lanDevices.get(device.deviceid).online || false
          this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory)
        }
      }
    } else if (cns.devicesRFBridge.includes(device.extra.uiid)) {
      let rfChlCounter = 0
      const rfMap = []
      if (Object.prototype.hasOwnProperty.call(device, 'tags') && Object.prototype.hasOwnProperty.call(device.tags, 'zyx_info')) {
        device.tags.zyx_info.forEach(remote =>
          rfMap.push({
            name: remote.name,
            type: remote.remote_type,
            buttons: Object.assign({}, ...remote.buttonName)
          })
        )
      }
      const accessory = this.devicesInHB.has(device.deviceid + 'SW0')
        ? this.devicesInHB.get(device.deviceid + 'SW0')
        : this.addAccessory(device, device.deviceid + 'SW0', 'rf_pri', true, {
          rfMap
        })
      // this.log.error(JSON.stringify(accessory.context, null, 2))
      rfMap.forEach(subDevice => {
        const swNumber = rfChlCounter + 1
        let subAccessory
        let subType
        let subExtraContext = {}
        switch (subDevice.type) {
          case '1':
          case '2':
          case '3':
          case '4':
            subType = 'button'
            break
          case '6':
            subType = this.cusS.has(device.deviceid + 'SW' + swNumber)
              ? this.cusS.get(device.deviceid + 'SW' + swNumber).type
              : 'motion'
            break
          default:
            return
        }
        subExtraContext = {
          buttons: subDevice.buttons,
          subType,
          swNumber
        }
        if ((subAccessory = this.devicesInHB.get(device.deviceid + 'SW' + swNumber))) {
          if (subAccessory.context.subType !== subType || subAccessory.context.swNumber !== swNumber) {
            this.removeAccessory(subAccessory)
          }
        }
        subAccessory = this.devicesInHB.has(device.deviceid + 'SW' + swNumber)
          ? this.devicesInHB.get(device.deviceid + 'SW' + swNumber)
          : this.addAccessory(device, device.deviceid + 'SW' + swNumber, 'rf_sub', false, subExtraContext)
        subAccessory
          .getService(Service.AccessoryInformation)
          .setCharacteristic(Characteristic.FirmwareRevision, device.params.fwVersion)
        subAccessory.context.reachableWAN = device.online
        subAccessory.context.reachableLAN = false
        this.devicesInHB.set(subAccessory.context.hbDeviceId, subAccessory)
        // this.log.warn(JSON.stringify(subAccessory.context, null, 2))
        rfChlCounter += Object.keys(subDevice.buttons || {}).length
      })
      accessory.context.channelCount = rfChlCounter
      this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
    } else if (cns.devicesZBBridge.includes(device.extra.uiid)) {
      // Nothing to do here but needed to avoid the below not supported error
      //* ** @UPGRADE from v2 -> v3  23.09.2020 ***\\
      if ((accessory = this.devicesInHB.get(device.deviceid + 'SWX'))) {
        this.removeAccessory(accessory)
      }
      //* ** @ENDUPGRADE ***\\
    } else if (cns.devicesZB.includes(device.extra.uiid)) {
      accessory = this.devicesInHB.has(device.deviceid + 'SWX')
        ? this.devicesInHB.get(device.deviceid + 'SWX')
        : this.addAccessory(device, device.deviceid + 'SWX', 'zb_dev')
      //* ** @UPGRADE from v2 -> v3  23.09.2020 ***\\
      if (accessory.context.type === 'zb_sub') {
        accessory.context.type = 'zb_dev'
      }
      //* ** @ENDUPGRADE ***\\
    } else if (cns.devicesCamera.includes(device.extra.uiid)) {
      this.log.warn(
        ' → [%s] please see "https://github.com/bwp91/homebridge-ewelink/wiki/How-to-set-up-Sonoff-Camera".',
        device.name
      )
      return
    } else {
      this.log.warn(
        ' → [%s] cannot be added as it is not supported by this plugin. Please make a GitHub issue request.',
        device.name
      )
      return
    }
    if (!accessory) return
    if (!this.hiddenMasters.includes(device.deviceid)) {
      accessory
        .getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.FirmwareRevision, device.params.fwVersion)
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
      if (cns.devicesNonLAN.includes(device.extra.uiid)) {
        str += "doesn't support it"
      } else if (Object.prototype.hasOwnProperty.call(device, 'sharedBy') && Object.prototype.hasOwnProperty.call(device.sharedBy, 'email')) {
        str += 'is shared (' + device.sharedBy.email + ')'
      } else {
        str += 'is unreachable'
      }
    }
    this.log(' → [%s] initialised %s.', device.name, str)
    this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
    if (!this.config.disableHTTPRefresh && !(accessory.context.switchNumber === '0' && this.hiddenMasters.includes(device.deviceid))) {
      if (!this.refreshAccessory(accessory, device.params)) {
        this.log.warn(
          '[%s] could not be initialised. Please try removing accessory from the Homebridge cache along with any secondary devices (SW1, SW2, etc.) [debug:%s:%s].',
          accessory.displayName,
          accessory.context.type,
          accessory.context.channelCount
        )
        this.log.warn(
          'If you are unsure how to do this, please see "https://github.com/bwp91/homebridge-ewelink/wiki/How-to-remove-an-accessory-from-the-cache'
        )
      }
    }
  }

  addAccessory (device, hbDeviceId, type, hidden = false, extraContext = {}) {
    const switchNumber = hbDeviceId.substr(-1).toString()
    let newDeviceName = type === 'rf_sub' ? device.tags.zyx_info[switchNumber - 1].name : device.name
    const channelCount =
      type === 'rf_pri'
        ? Object.keys((device.tags && device.tags.zyx_info) || []).length
        : cns.chansFromUiid[device.extra.uiid]
    if (['1', '2', '3', '4'].includes(switchNumber) && type !== 'rf_sub') {
      newDeviceName += ' SW' + switchNumber
    }
    if (Object.prototype.hasOwnProperty.call(this.config.nameOverride || {}, hbDeviceId)) {
      newDeviceName = this.config.nameOverride[hbDeviceId]
    }
    try {
      const accessory = new Accessory(newDeviceName, this.api.hap.uuid.generate(hbDeviceId).toString())
      if (!hidden) {
        accessory
          .getService(Service.AccessoryInformation)
          .setCharacteristic(Characteristic.SerialNumber, hbDeviceId)
          .setCharacteristic(Characteristic.Manufacturer, device.brandName)
          .setCharacteristic(Characteristic.Model, device.productModel + ' (' + device.extra.model + ')')
          .setCharacteristic(Characteristic.FirmwareRevision, device.params.fwVersion)
          .setCharacteristic(Characteristic.Identify, false)
      }
      accessory.context = {
        ...{
          hbDeviceId,
          eweDeviceId: device.deviceid,
          eweUIID: device.extra.uiid,
          eweModel: device.productModel,
          eweApiKey: device.apikey,
          switchNumber,
          channelCount,
          type
        },
        ...extraContext
      }
      if (!hidden) {
        this.api.registerPlatformAccessories('homebridge-ewelink', 'eWeLink', [accessory])
        this.configureAccessory(accessory)
        this.log(' → [%s] has been added to Homebridge.', newDeviceName)
      }
      return accessory
    } catch (err) {
      this.log.warn(' → [%s] could not be added as %s.', newDeviceName, err)
      return false
    }
  }

  configureAccessory (accessory) {
    if (!this.log) return
    try {
      accessory.context.reachableWAN = true
      accessory.context.reachableLAN = true
      switch (accessory.context.type) {
        case 'curtain': {
          accessory.control = new DeviceCurtain(this)
          let cService
          if (!(cService = accessory.getService(Service.WindowCovering))) {
            accessory
              .addService(Service.WindowCovering)
              .setCharacteristic(Characteristic.CurrentPosition, 0)
              .setCharacteristic(Characteristic.TargetPosition, 0)
              .setCharacteristic(Characteristic.PositionState, 2)
            cService = accessory.getService(Service.WindowCovering)
          }
          cService
            .getCharacteristic(Characteristic.TargetPosition)
            .on('set', (value, callback) => accessory.control.internalCurtainUpdate(accessory, value, callback))
          break
        }
        case 'blind': {
          accessory.control = new DeviceBlind(this)
          let wcService
          if (!(wcService = accessory.getService(Service.WindowCovering))) {
            accessory
              .addService(Service.WindowCovering)
              .setCharacteristic(Characteristic.CurrentPosition, 0)
              .setCharacteristic(Characteristic.TargetPosition, 0)
              .setCharacteristic(Characteristic.PositionState, 2)
            wcService = accessory.getService(Service.WindowCovering)
          }
          wcService
            .getCharacteristic(Characteristic.TargetPosition)
            .on('set', (value, callback) => accessory.control.internalBlindUpdate(accessory, value, callback))
          break
        }
        case 'garage': {
          accessory.control = new DeviceGarage(this)
          let gdService
          if (!(gdService = accessory.getService(Service.GarageDoorOpener))) {
            accessory
              .addService(Service.GarageDoorOpener)
              .setCharacteristic(Characteristic.CurrentDoorState, 1)
              .setCharacteristic(Characteristic.TargetDoorState, 1)
              .setCharacteristic(Characteristic.ObstructionDetected, false)
            gdService = accessory.getService(Service.GarageDoorOpener)
          }
          gdService
            .getCharacteristic(Characteristic.TargetDoorState)
            .on('set', (value, callback) => accessory.control.internalGarageUpdate(accessory, value, callback))
          break
        }
        case 'lock': {
          accessory.control = new DeviceLock(this)
          const lmService = accessory.getService(Service.LockMechanism) || accessory.addService(Service.LockMechanism)
          lmService
            .getCharacteristic(Characteristic.LockTargetState)
            .on('set', (value, callback) => accessory.control.internalLockUpdate(accessory, value, callback))
          break
        }
        case 'valve': {
          accessory.control = new DeviceValve(this)
          const valveConfig = this.cusG.get(accessory.context.hbDeviceId)
          const arr = ['A', 'B']
          arr.forEach(v => {
            let valveService
            if (!(valveService = accessory.getService('Valve ' + v))) {
              accessory
                .addService(Service.Valve, 'Valve ' + v, 'valve' + v.toLowerCase())
                .setCharacteristic(Characteristic.Active, 0)
                .setCharacteristic(Characteristic.InUse, 0)
                .setCharacteristic(Characteristic.ValveType, 1)
                .setCharacteristic(Characteristic.SetDuration, Math.round(valveConfig.operationTime / 10) || 120)
                .addCharacteristic(Characteristic.RemainingDuration)
              valveService = accessory.getService('Valve ' + v)
            }
            valveService
              .getCharacteristic(Characteristic.Active)
              .on('set', (value, callback) =>
                accessory.control.internalValveUpdate(accessory, 'Valve ' + v, value, callback)
              )
            valveService.getCharacteristic(Characteristic.SetDuration).on('set', (value, callback) => {
              if (valveService.getCharacteristic(Characteristic.InUse).value) {
                valveService.updateCharacteristic(Characteristic.RemainingDuration, value)
                clearTimeout(valveService.timer)
                valveService.timer = setTimeout(() => {
                  valveService.setCharacteristic(Characteristic.Active, 0)
                }, value * 1000)
              }
              callback()
            })
          })
          break
        }
        case 'sensor': {
          accessory.control = new DeviceSensor(this)
          accessory.getService(Service.ContactSensor) || accessory.addService(Service.ContactSensor)
          accessory.getService(Service.BatteryService) || accessory.addService(Service.BatteryService)
          break
        }
        case 'fan': {
          accessory.control = new DeviceFan(this)
          const fanService = accessory.getService(Service.Fanv2) || accessory.addService(Service.Fanv2)
          const fanLightService = accessory.getService(Service.Lightbulb) || accessory.addService(Service.Lightbulb)
          fanService
            .getCharacteristic(Characteristic.Active)
            .on('set', (value, callback) => accessory.control.internalFanUpdate(accessory, 'power', value, callback))
          fanService
            .getCharacteristic(Characteristic.RotationSpeed)
            .on('set', (value, callback) => accessory.control.internalFanUpdate(accessory, 'speed', value, callback))
            .setProps({
              minStep: 33
            })
          fanLightService
            .getCharacteristic(Characteristic.On)
            .on('set', (value, callback) => accessory.control.internalFanUpdate(accessory, 'light', value, callback))
          break
        }
        case 'thermostat': {
          accessory.control = new DeviceThermostat(this)
          const tempService = accessory.getService(Service.TemperatureSensor) || accessory.addService(Service.TemperatureSensor)
          let humiService = false
          if (accessory.context.sensorType !== 'DS18B20') {
            humiService = accessory.getService(Service.HumiditySensor) || accessory.addService(Service.HumiditySensor)
          }
          if (!this.config.hideTHSwitch) {
            const switchService = accessory.getService(Service.Switch) || accessory.addService(Service.Switch)
            switchService
              .getCharacteristic(Characteristic.On)
              .on('set', (value, callback) => accessory.control.internalThermostatUpdate(accessory, value, callback))
          }
          if (!this.config.disableEveLogging) {
            accessory.log = this.log
            accessory.eveLogger = new EveHistoryService('weather', accessory, {
              storage: 'fs',
              minutes: 5,
              path: this.eveLogPath
            })
            corrInterval.setCorrectingInterval(() => {
              const dataToAdd = {
                time: Date.now(),
                temp: tempService.getCharacteristic(Characteristic.CurrentTemperature).value
              }
              if (humiService) {
                dataToAdd.humidity = humiService.getCharacteristic(Characteristic.CurrentRelativeHumidity).value
              }
              accessory.eveLogger.addEntry(dataToAdd)
            }, 300000)
          }
          break
        }
        case 'outlet': {
          accessory.control = new DeviceOutlet(this)
          let outletService
          if (!(outletService = accessory.getService(Service.Outlet))) {
            accessory.addService(Service.Outlet)
            outletService = accessory.getService(Service.Outlet)
            if (accessory.context.eweModel !== 'S26' && !this.config.disableEveLogging) {
              outletService.addCharacteristic(EveService.Characteristics.Voltage)
              outletService.addCharacteristic(EveService.Characteristics.CurrentConsumption)
              outletService.addCharacteristic(EveService.Characteristics.ElectricCurrent)
              outletService.addCharacteristic(EveService.Characteristics.TotalConsumption)
              outletService.addCharacteristic(EveService.Characteristics.ResetTotal)
              accessory.context = {
                ...accessory.context,
                ...{
                  extraPersistedData: {},
                  lastReset: 0,
                  totalEnergy: 0,
                  totalEnergyTemp: 0
                }
              }
            }
          }
          outletService
            .getCharacteristic(Characteristic.On)
            .on('set', (value, callback) => accessory.control.internalOutletUpdate(accessory, value, callback))
          if (accessory.context.eweModel !== 'S26' && !this.config.disableEveLogging) {
            accessory.log = this.log
            accessory.eveLogger = new EveHistoryService('energy', accessory, {
              storage: 'fs',
              minutes: 5,
              path: this.eveLogPath
            })
            corrInterval.setCorrectingInterval(() => {
              const isOn = outletService.getCharacteristic(Characteristic.On).value
              const currentWatt = isOn
                ? outletService.getCharacteristic(EveService.Characteristics.CurrentConsumption).value
                : 0
              if (accessory.eveLogger.isHistoryLoaded()) {
                accessory.context.extraPersistedData = accessory.eveLogger.getExtraPersistedData()
                if (accessory.context.extraPersistedData !== undefined) {
                  accessory.context.totalEnergy =
                    accessory.context.extraPersistedData.totalenergy +
                    accessory.context.totalEnergyTemp +
                    (currentWatt * 10) / 3600 / 1000
                  accessory.eveLogger.setExtraPersistedData({
                    totalenergy: accessory.context.totalEnergy,
                    lastReset: accessory.context.extraPersistedData.lastReset
                  })
                } else {
                  accessory.context.totalEnergy = accessory.context.totalEnergyTemp + (currentWatt * 10) / 3600 / 1000
                  accessory.eveLogger.setExtraPersistedData({
                    totalenergy: accessory.context.totalEnergy,
                    lastReset: 0
                  })
                }
                accessory.context.totalEnergytemp = 0
              } else {
                accessory.context.totalEnergyTemp += (currentWatt * 10) / 3600 / 1000
                accessory.context.totalEnergy = accessory.context.totalEnergyTemp
              }
              accessory.eveLogger.addEntry({
                time: Date.now(),
                power: currentWatt
              })
            }, 300000)
            outletService
              .getCharacteristic(EveService.Characteristics.TotalConsumption)
              .on('get', callback => {
                accessory.context.extraPersistedData = accessory.eveLogger.getExtraPersistedData()
                if (accessory.context.extraPersistedData !== undefined) {
                  accessory.context.totalEnergy = accessory.context.extraPersistedData.totalPower
                }
                callback(null, accessory.context.totalEnergy)
              })
            outletService
              .getCharacteristic(EveService.Characteristics.ResetTotal)
              .on('set', (value, callback) => {
                accessory.context.totalEnergy = 0
                accessory.context.lastReset = value
                accessory.eveLogger.setExtraPersistedData({
                  totalPower: 0,
                  lastReset: value
                })
                callback()
              })
              .on('get', callback => {
                accessory.context.extraPersistedData = accessory.eveLogger.getExtraPersistedData()
                if (accessory.context.extraPersistedData !== undefined) {
                  accessory.context.lastReset = accessory.context.extraPersistedData.lastReset
                }
                callback(null, accessory.context.lastReset)
              })
          }
          break
        }
        case 'usb': {
          accessory.control = new DeviceUSB(this)
          const usbService = accessory.getService(Service.Outlet) || accessory.addService(Service.Outlet)
          usbService
            .getCharacteristic(Characteristic.On)
            .on('set', (value, callback) => accessory.control.internalUSBUpdate(accessory, value, callback))
          break
        }
        case 'scm': {
          accessory.control = new DeviceSCM(this)
          const scmService = accessory.getService(Service.Switch) || accessory.addService(Service.Switch)
          scmService
            .getCharacteristic(Characteristic.On)
            .on('set', (value, callback) => accessory.control.internalSCMUpdate(accessory, value, callback))
          break
        }
        case 'light': {
          accessory.control = new DeviceLight(this)
          const lightService = accessory.getService(Service.Lightbulb) || accessory.addService(Service.Lightbulb)
          lightService
            .getCharacteristic(Characteristic.On)
            .on('set', (value, callback) => accessory.control.internalLightbulbUpdate(accessory, value, callback))
          if (cns.devicesBrightable.includes(accessory.context.eweUIID)) {
            lightService.getCharacteristic(Characteristic.Brightness).on('set', (value, callback) => {
              if (value > 0) {
                if (!lightService.getCharacteristic(Characteristic.On).value) {
                  accessory.control.internalLightbulbUpdate(accessory, true, function () {})
                }
                accessory.control.internalBrightnessUpdate(accessory, value, callback)
              } else {
                accessory.control.internalLightbulbUpdate(accessory, false, callback)
              }
            })
          } else if (cns.devicesColourable.includes(accessory.context.eweUIID)) {
            lightService.getCharacteristic(Characteristic.Brightness).on('set', (value, callback) => {
              if (value > 0) {
                if (!lightService.getCharacteristic(Characteristic.On).value) {
                  accessory.control.internalLightbulbUpdate(accessory, true, function () {})
                }
                accessory.control.internalHSBUpdate(accessory, 'bri', value, callback)
              } else {
                accessory.control.internalLightbulbUpdate(accessory, false, callback)
              }
            })
            lightService
              .getCharacteristic(Characteristic.Hue)
              .on('set', (value, callback) => accessory.control.internalHSBUpdate(accessory, 'hue', value, callback))
            lightService.getCharacteristic(Characteristic.Saturation).on('set', (value, callback) => callback())
          }
          break
        }
        case 'switch': {
          accessory.control = new DeviceSwitch(this)
          const switchService = accessory.getService(Service.Switch) || accessory.addService(Service.Switch)
          switchService
            .getCharacteristic(Characteristic.On)
            .on('set', (value, callback) => accessory.control.internalSwitchUpdate(accessory, value, callback))
          break
        }
        case 'rf_sub': {
          accessory.control = new DeviceRFSub(this)
          switch (accessory.context.subType) {
            case 'water':
              accessory.getService(Service.LeakSensor) || accessory.addService(Service.LeakSensor)
              break
            case 'fire':
            case 'smoke':
              accessory.getService(Service.SmokeSensor) || accessory.addService(Service.SmokeSensor)
              break
            case 'co':
              accessory.getService(Service.CarbonMonoxideSensor) || accessory.addService(Service.CarbonMonoxideSensor)
              break
            case 'co2':
              accessory.getService(Service.CarbonDioxideSensor) || accessory.addService(Service.CarbonDioxideSensor)
              break
            case 'contact':
              accessory.getService(Service.ContactSensor) || accessory.addService(Service.ContactSensor)
              break
            case 'occupancy':
              accessory.getService(Service.OccupancySensor) || accessory.addService(Service.OccupancySensor)
              break
            default:
              accessory.getService(Service.MotionSensor) || accessory.addService(Service.MotionSensor)
              break
            case 'button':
              Object.entries(accessory.context.buttons).forEach(([chan, name]) => {
                accessory.getService(name) || accessory.addService(Service.Switch, name, 'switch' + chan)
                accessory.getService(name).updateCharacteristic(Characteristic.On, false)
                accessory
                  .getService(name)
                  .getCharacteristic(Characteristic.On)
                  .on('set', (value, callback) => {
                    value ? accessory.control.internalRFUpdate(accessory, chan, name, callback) : callback()
                  })
              })
              break
          }
          break
        }
        case 'zb_dev': { //* ** credit @tasict ***\\
          accessory.control = new DeviceZBDev(this)
          accessory.getService(Service.BatteryService) || accessory.addService(Service.BatteryService)
          switch (accessory.context.eweUIID) {
            case 1000: {
              const zbspsService =
                accessory.getService(Service.StatelessProgrammableSwitch) ||
                accessory.addService(Service.StatelessProgrammableSwitch)
              if (this.config.hideZBLDPress) {
                zbspsService.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setProps({
                  validValues: [0]
                })
              }
              break
            }
            case 1770: {
              const zbTempService =
                accessory.getService(Service.TemperatureSensor) || accessory.addService(Service.TemperatureSensor)
              const zbHumiService =
                accessory.getService(Service.HumiditySensor) || accessory.addService(Service.HumiditySensor)
              accessory.log = this.log
              accessory.eveLogger = new EveHistoryService('weather', accessory, {
                storage: 'fs',
                minutes: 5,
                path: this.eveLogPath
              })
              corrInterval.setCorrectingInterval(() => {
                const dataToAdd = {
                  time: Date.now(),
                  temp: zbTempService.getCharacteristic(Characteristic.CurrentTemperature).value,
                  humidity: zbHumiService.getCharacteristic(Characteristic.CurrentRelativeHumidity).value
                }
                accessory.eveLogger.addEntry(dataToAdd)
              }, 300000)
              break
            }
            case 2026:
              accessory.getService(Service.MotionSensor) || accessory.addService(Service.MotionSensor)
              break
            case 3026:
              accessory.getService(Service.ContactSensor) || accessory.addService(Service.ContactSensor)
              break
          }
          break
        }
      }
      this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
    } catch (err) {
      this.log.warn('[%s] could not be configured as %s.', accessory.displayName, err)
    }
  }

  refreshAccessory (accessory, newParams) {
    switch (accessory.context.type) {
      case 'valve':
        accessory.control.externalValveUpdate(accessory, newParams)
        return true
      case 'curtain':
        accessory.control.externalCurtainUpdate(accessory, newParams)
        return true
      case 'blind':
        return true
      case 'garage':
        accessory.control.externalGarageUpdate(accessory, newParams)
        return true
      case 'lock':
        accessory.control.externalLockUpdate(accessory, newParams)
        return true
      case 'sensor':
        accessory.control.externalSensorUpdate(accessory, newParams)
        return true
      case 'fan':
        accessory.control.externalFanUpdate(accessory, newParams)
        return true
      case 'thermostat':
        accessory.control.externalThermostatUpdate(accessory, newParams)
        return true
      case 'outlet':
        accessory.control.externalOutletUpdate(accessory, newParams)
        return true
      case 'usb':
        accessory.control.externalUSBUpdate(accessory, newParams)
        return true
      case 'scm':
        accessory.control.externalSCMUpdate(accessory, newParams)
        return true
      case 'light':
        if (
          cns.devicesSingleSwitch.includes(accessory.context.eweUIID) &&
          cns.devicesSingleSwitchLight.includes(accessory.context.eweModel)
        ) {
          accessory.control.externalSingleLightUpdate(accessory, newParams)
        } else if (
          cns.devicesMultiSwitch.includes(accessory.context.eweUIID) &&
          cns.devicesMultiSwitchLight.includes(accessory.context.eweModel)
        ) {
          accessory.control.externalMultiLightUpdate(accessory, newParams)
        }
        return true
      case 'switch':
        if (cns.devicesSingleSwitch.includes(accessory.context.eweUIID)) {
          accessory.control.externalSingleSwitchUpdate(accessory, newParams)
        } else if (cns.devicesMultiSwitch.includes(accessory.context.eweUIID)) {
          accessory.control.externalMultiSwitchUpdate(accessory, newParams)
        }
        return true
      case 'rf_pri':
        accessory.control.externalRFUpdate(accessory, newParams)
        return true
      case 'rf_sub':
        return true
      case 'zb_dev':
        accessory.control.externalZBUpdate(accessory, newParams)
        return true
      default:
        return false
    }
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

  async sendDeviceUpdate (accessory, params) {
    const payload = {
      apikey: accessory.context.eweApiKey,
      deviceid: accessory.context.eweDeviceId,
      params
    }
    try {
      await utils.sleep(Math.random() * 100 + 200)
      await this.lanClient.sendUpdate(payload)
    } catch (err) {
      if (accessory.context.reachableWAN) {
        if (this.debug) {
          this.log.warn('[%s] Reverting to web socket as LAN mode warning - %s.', accessory.displayName, this.debug ? err : err.message)
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
          this.log.warn(
            '[%s] has been reported [%s] via [WS].',
            accessory.displayName,
            accessory.context.reachableWAN ? 'online' : 'offline'
          )
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
        this.log(
          '[%s] externally updated from above %s message and will be refreshed.',
          accessory.displayName,
          device.params.updateSource
        )
      }
      if (!this.refreshAccessory(accessory, device.params)) {
        this.log.warn(
          '[%s] cannot be refreshed. Please try removing accessory from the Homebridge cache along with any secondary devices (SW1, SW2, etc.). [debug:%s:%s]',
          accessory.displayName,
          accessory.context.type,
          accessory.context.channelCount
        )
        this.log.warn(
          'If you are unsure how to do this, please see "https://github.com/bwp91/homebridge-ewelink/wiki/How-to-remove-an-accessory-from-the-cache'
        )
      }
    } else {
      if (!(this.config.hideDevFromHB || '').includes(deviceId)) {
        this.log.warn(
          '[%s] update received via %s does not exist in Homebridge so device will be added.',
          deviceId,
          device.params.updateSource
        )
        try {
          const device = await this.httpClient.getDevice(deviceId)
          this.initialiseDevice(device)
          this.lanClient.addDeviceToMap(device)
        } catch (err) {
          this.log.error('[%s] error getting info [%s]', deviceId, err)
          this.log.error('[%s] Please try restarting Homebridge so this device is added.', deviceId)
        }
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
}
module.exports = function (homebridge) {
  Accessory = homebridge.platformAccessory
  Characteristic = homebridge.hap.Characteristic
  EveService = new hbLib.EveHomeKitTypes(homebridge)
  EveHistoryService = fakegato(homebridge)
  Service = homebridge.hap.Service
  return eWeLink
}
