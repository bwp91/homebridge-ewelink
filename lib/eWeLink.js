'use strict'
let Characteristic, Service
const cns = require('./constants')
const DeviceCurtain = require('./device/curtain')
const DeviceBlind = require('./device/blind')
const DeviceGarage = require('./device/garage')
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
const EWeLinkHTTP = require('./eWeLinkHTTP')
const EWeLinkWS = require('./eWeLinkWS')
const EWeLinkLAN = require('./eWeLinkLAN')
const promInterval = require('interval-promise')
const utils = require('./utils')
class eWeLink {
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
    this.debug = this.config.debug || false
    this.devicesInHB = new Map()
    this.devicesInEW = new Map()
    this.cusG = new Map()
    this.cusS = new Map()
    this.hiddenMasters = []
    this.eveLogPath = this.api.user.storagePath() + '/homebridge-ewelink/'
    this.wsRefreshFlag = true
    this.api
      .on('didFinishLaunching', () => this.eWeLinkSetup())
      .on('shutdown', () => this.eWeLinkShutdown())
  }

  async eWeLinkSetup () {
    try {
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
      await this.lanClient.startMonitor();
      (() => {
        if (Object.keys(this.config.groups || []).length > 0) {
          this.config.groups
            .filter(g => Object.prototype.hasOwnProperty.call(g, 'type') && cns.allowedGroups.includes(g.type))
            .filter(g => Object.prototype.hasOwnProperty.call(g, 'deviceId') && this.devicesInEW.has(g.deviceId))
            .forEach(g => this.cusG.set(g.deviceId + 'SWX', g))
        }
        if (Object.keys(this.config.bridgeSensors || []).length > 0) {
          this.config.bridgeSensors
            .filter(s => Object.prototype.hasOwnProperty.call(s, 'deviceId') && this.devicesInEW.has(s.deviceId))
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
                  await utils.sleep(250)
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
    try {
      if (this.cusG.has(device.deviceid + 'SWX')) {
        const all = ['X', '0', '1', '2', '3', '4']
        all.forEach(v => {
          if (this.devicesInHB.has(device.deviceid + 'SW' + v)) {
            if (this.devicesInHB.get(device.deviceid + 'SW' + v).getService(Service.Switch)) {
              this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SW' + v))
            }
          }
        })
      }
      if (cns.devicesCurtain.includes(device.extra.uiid)) {
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, { cacheCurrentPosition: 0 })
        accessory.control = new DeviceCurtain(this, accessory)
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'blind') {
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, {
            cacheCurrentPosition: 0,
            cachePositionState: 2,
            cacheTargetPosition: 0
          })
        accessory.control = new DeviceBlind(this, accessory)
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'garage') {
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, {
            cacheCurrentDoorState: 1,
            cacheTargetDoorState: 1
          })
        accessory.control = new DeviceGarage(this, accessory)
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'garage_eachen') {
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceGarageEachen(this, accessory)
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'lock') {
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceLock(this, accessory)
      } else if (this.cusG.has(device.deviceid + 'SWX') && this.cusG.get(device.deviceid + 'SWX').type === 'valve') {
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceValve(this, accessory)
      } else if (cns.devicesSensor.includes(device.extra.uiid)) {
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, { type: 'sensor' })
        accessory.control = new DeviceSensor(this, accessory)
      } else if (cns.devicesFan.includes(device.extra.uiid)) {
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceFan(this, accessory)
      } else if (cns.devicesThermostat.includes(device.extra.uiid)) {
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX', false, {
            sensorType: device.params.sensorType
          })
        if (accessory.context.sensorType !== device.params.sensorType) {
          accessory.context.sensorType = device.params.sensorType
        }
        accessory.control = new DeviceThermostat(this, accessory)
      } else if (cns.devicesOutlet.includes(device.extra.uiid) || (cns.devicesSingleSwitch.includes(device.extra.uiid) && cns.devicesSingleSwitchOutlet.includes(device.productModel))) {
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceOutlet(this, accessory)
      } else if (cns.devicesUSB.includes(device.extra.uiid)) {
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceUSB(this, accessory)
      } else if (cns.devicesSCM.includes(device.extra.uiid)) {
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceSCM(this, accessory)
      } else if (cns.devicesSingleSwitch.includes(device.extra.uiid) && cns.devicesSingleSwitchLight.includes(device.productModel)) {
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceLight(this, accessory)
      } else if (cns.devicesMultiSwitch.includes(device.extra.uiid) && cns.devicesMultiSwitchLight.includes(device.productModel)) {
        if (this.config.hideMasters) {
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
        for (let i = 1; i <= cns.chansFromUiid[device.extra.uiid]; i++) {
          if ((this.config.hideFromHB || '').includes(device.deviceid + 'SW' + i)) {
            if (this.devicesInHB.has(device.deviceid + 'SW' + i)) {
              this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SW' + i))
            }
          } else {
            const oAccessory = this.devicesInHB.has(device.deviceid + 'SW' + i)
              ? this.devicesInHB.get(device.deviceid + 'SW' + i)
              : this.addAccessory(device, device.deviceid + 'SW' + i)
            oAccessory
              .getService(Service.AccessoryInformation)
              .setCharacteristic(Characteristic.FirmwareRevision, device.params.fwVersion)
            oAccessory.context.reachableWAN = device.online
            oAccessory.context.reachableLAN = this.lanDevices.get(device.deviceid).online || false
            this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory)
            oAccessory.control = new DeviceLight(this, oAccessory)
          }
        }
      } else if (cns.devicesSingleSwitch.includes(device.extra.uiid)) {
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceSwitch(this, accessory)
      } else if (cns.devicesMultiSwitch.includes(device.extra.uiid)) {
        if (this.config.hideMasters) {
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
        for (let i = 1; i <= cns.chansFromUiid[device.extra.uiid]; i++) {
          if ((this.config.hideFromHB || '').includes(device.deviceid + 'SW' + i)) {
            if (this.devicesInHB.has(device.deviceid + 'SW' + i)) {
              this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SW' + i))
            }
          } else {
            const oAccessory = this.devicesInHB.has(device.deviceid + 'SW' + i)
              ? this.devicesInHB.get(device.deviceid + 'SW' + i)
              : this.addAccessory(device, device.deviceid + 'SW' + i)
            oAccessory
              .getService(Service.AccessoryInformation)
              .setCharacteristic(Characteristic.FirmwareRevision, device.params.fwVersion)
            oAccessory.context.reachableWAN = device.online
            oAccessory.context.reachableLAN = this.lanDevices.get(device.deviceid).online || false
            this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory)
            oAccessory.control = new DeviceSwitch(this, oAccessory)
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
        accessory = this.devicesInHB.has(device.deviceid + 'SW0')
          ? this.devicesInHB.get(device.deviceid + 'SW0')
          : this.addAccessory(device, device.deviceid + 'SW0', true, {
            rfMap
          }, 'rf_pri')
        accessory.control = new DeviceRFBridge(this, accessory)
        this.hiddenMasters.push(device.deviceid)
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
            : this.addAccessory(device, device.deviceid + 'SW' + swNumber, false, subExtraContext, 'rf_sub')
          subAccessory
            .getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.FirmwareRevision, device.params.fwVersion)
          subAccessory.context.reachableWAN = device.online
          subAccessory.context.reachableLAN = false
          this.devicesInHB.set(subAccessory.context.hbDeviceId, subAccessory)
          subAccessory.control = new DeviceRFBridge(this, subAccessory)
          rfChlCounter += Object.keys(subDevice.buttons || {}).length
        })
        accessory.context.channelCount = rfChlCounter
        this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
      } else if (cns.devicesZBBridge.includes(device.extra.uiid)) {
        if (this.devicesInHB.has(device.deviceid + 'SW0')) {
          this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SW0'))
        }
      } else if (cns.devicesZB.includes(device.extra.uiid)) {
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new DeviceZBDev(this, accessory)
      } else if (cns.devicesCamera.includes(device.extra.uiid)) {
        this.log.warn(' → [%s] please see the homebridge-ewelink wiki for details to enable the camera.', device.name)
        return
      } else {
        this.log.warn(' → [%s] has not been added as it is not supported. Please make a GitHub issue request.', device.name)
        return
      }
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
      if (!this.config.disableHTTPRefresh) accessory.control.externalUpdate(accessory, device.params)
      this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
      this.log(' → [%s] initialised %s.', device.name, str)
    } catch (err) {
      const deviceName = accessory && Object.prototype.hasOwnProperty.call(accessory, 'displayName')
        ? accessory.displayName
        : device.name
      this.log.warn('[%s] could not be initialised as %s.', deviceName, this.debug ? err : err.message)
    }
  }

  addAccessory (device, hbDeviceId, hidden = false, extraContext = {}, type = '') {
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
      const accessory = new this.api.platformAccessory(newDeviceName, this.api.hap.uuid.generate(hbDeviceId).toString())
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
    await utils.sleep(Math.random() * 100 + 200)
    const res = await this.lanClient.sendUpdate(payload)
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
        accessory.control.externalUpdate(accessory, device.params)
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
module.exports = function (homebridge) {
  Characteristic = homebridge.hap.Characteristic
  Service = homebridge.hap.Service
  return eWeLink
}
