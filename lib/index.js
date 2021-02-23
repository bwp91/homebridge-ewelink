/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

// Retrieve necessary fields from the package.json file
const PLUGIN = require('./../package.json')

// Create the platform class
class eWeLinkPlatform {
  constructor (log, config, api) {
    // Don't load the plugin if these aren't accessible for any reason
    if (!log || !api) {
      return
    }

    // Retrieve the necessary constants and functions before starting
    this.consts = require('./utils/constants')
    this.messages = require('./utils/messages')
    this.funcs = require('./utils/functions')

    // Begin plugin initialisation
    try {
      // Check the user has configured the plugin
      if (!config || !config.username || !config.password || !config.countryCode) {
        throw new Error(this.messages.missingCreds)
      }

      // Initialise these variables before anything else
      this.log = log
      this.api = api
      this.fanDevices = {}
      this.lightDevices = {}
      this.multiDevices = {}
      this.outletDevices = {}
      this.sensorDevices = {}
      this.singleDevices = {}
      this.thDevices = {}
      this.rfDevices = {}
      this.simulations = {}
      this.hideChannels = []
      this.hideMasters = []
      this.ipOverride = {}
      this.obstructSwitches = {}

      // Apply the user's configuration
      this.config = this.consts.defaultConfig
      this.applyUserConfig(config)

      // Create further variables needed by the plugin
      this.devicesInHB = new Map()
      this.devicesInEW = new Map()

      // Set up the Homebridge events
      this.api.on('didFinishLaunching', this.pluginSetup.bind(this))
      this.api.on('shutdown', this.pluginShutdown.bind(this))
    } catch (err) {
      // Catch any errors during initialisation
      const hideErrLines = [
        this.messages.missingCC,
        this.messages.missingCreds,
        this.messages.missingPW,
        this.messages.missingUN
      ]
      const eText = hideErrLines.includes(err.message)
        ? err.message
        : this.funcs.parseError(err)
      log.warn('***** %s [v%s]. *****', this.messages.disabling, PLUGIN.version)
      log.warn('***** %s. *****', eText)
    }
  }

  applyUserConfig (config) {
    // These shorthand functions save line space during config parsing
    const logDefault = (k, def) => {
      this.log.warn('%s [%s] %s %s.', this.messages.cfgItem, k, this.messages.cfgDef, def)
    }
    const logIgnore = k => {
      this.log.warn('%s [%s] %s.', this.messages.cfgItem, k, this.messages.cfgIgn)
    }
    const logIgnoreItem = k => {
      this.log.warn('%s [%s] %s.', this.messages.cfgItem, k, this.messages.cfgIgnItem)
    }
    const logIncrease = (k, min) => {
      this.log.warn('%s [%s] %s %s.', this.messages.cfgItem, k, this.messages.cfgLow, min)
    }
    const logQuotes = k => {
      this.log.warn('%s [%s] %s.', this.messages.cfgItem, k, this.messages.cfgQts)
    }
    const logRemove = k => {
      this.log.warn('%s [%s] %s.', this.messages.cfgItem, k, this.messages.cfgRmv)
    }

    // Begin applying the user's config
    for (const [key, val] of Object.entries(config)) {
      switch (key) {
        case 'bridgeSensors':
          if (Array.isArray(val) && val.length > 0) {
            val.forEach(x => {
              if (!x.type || !x.fullDeviceId) {
                logIgnoreItem(key)
                return
              }
              const id = this.funcs.parseDeviceId(x.fullDeviceId)
              const entries = Object.entries(x)
              if (entries.length === 1) {
                logRemove(key + '.' + id)
                return
              }
              this.rfDevices[id] = {}
              for (const [k, v] of entries) {
                switch (k) {
                  case 'fullDeviceId':
                  case 'label':
                    break
                  case 'overrideDisabledLogging':
                    if (typeof v === 'string') {
                      logQuotes(key + '.' + id + '.' + k)
                    }
                    this.rfDevices[id][k] = v === 'false' ? false : !!v
                    break
                  case 'sensorTimeDifference':
                  case 'sensorTimeLength': {
                    if (typeof v === 'string') {
                      logQuotes(key + '.' + id + '.' + k)
                    }
                    const intVal = parseInt(v)
                    if (isNaN(intVal)) {
                      logDefault(key + '.' + id + '.' + k, this.consts.defaultValues[k])
                      this.rfDevices[id][k] = this.consts.defaultValues[k]
                    } else if (intVal < this.consts.minValues[k]) {
                      logIncrease(key + '.' + id + '.' + k, this.consts.minValues[k])
                      this.rfDevices[id][k] = this.consts.minValues[k]
                    } else {
                      this.rfDevices[id][k] = intVal
                    }
                    break
                  }
                  case 'type':
                    if (typeof v !== 'string' || v === '') {
                      logIgnore(key + '.' + id + '.' + k)
                    } else if (!this.consts.allowed.sensors.includes(v)) {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      this.rfDevices[id][k] = v
                    }
                    break
                  default:
                    logRemove(key + '.' + id + '.' + k)
                    break
                }
              }
            })
          } else {
            logIgnore(key)
          }
          break
        case 'countryCode': {
          if (!val) {
            throw new Error(this.messages.missingCC)
          } else {
            this.config.countryCode = this.funcs.parseCountryCode(val)
          }
          break
        }
        case 'debug':
        case 'debugFakegato':
        case 'disableDeviceLogging':
        case 'disablePlugin':
          if (typeof val === 'string') {
            logQuotes(key)
          }
          this.config[key] = val === 'false' ? false : !!val
          break
        case 'fanDevices':
        case 'lightDevices':
        case 'multiDevices':
        case 'outletDevices':
        case 'sensorDevices':
        case 'singleDevices':
        case 'thDevices':
          if (Array.isArray(val) && val.length > 0) {
            val.forEach(x => {
              if (!x.deviceId) {
                logIgnoreItem(key)
                return
              }
              const id = this.funcs.parseDeviceId(x.deviceId)
              const entries = Object.entries(x)
              if (entries.length === 1) {
                logRemove(key + '.' + id)
                return
              }
              this[key][id] = {}
              for (const [k, v] of entries) {
                if (!this.consts.allowed[key].includes(k)) {
                  logRemove(key + '.' + id + '.' + k)
                  continue
                }
                switch (k) {
                  case 'adaptiveLightingShift':
                  case 'brightnessStep':
                  case 'inUsePowerThreshold':
                  case 'lowBattThreshold':
                  case 'sensorTimeDifference': {
                    if (typeof v === 'string') {
                      logQuotes(key + '.' + id + '.' + k)
                    }
                    const intVal = parseInt(v)
                    if (isNaN(intVal)) {
                      logDefault(key + '.' + id + '.' + k, this.consts.defaultValues[k])
                      this[key][id][k] = this.consts.defaultValues[k]
                    } else if (intVal < this.consts.minValues[k]) {
                      logIncrease(key + '.' + id + '.' + k, this.consts.minValues[k])
                      this[key][id][k] = this.consts.minValues[k]
                    } else {
                      this[key][id][k] = intVal
                    }
                    break
                  }
                  case 'bulbModel': {
                    const inSet = this.consts.allowed[k].includes(v)
                    if (typeof v !== 'string' || !inSet) {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      this[key][id][k] = inSet
                        ? v
                        : this.consts.defaultValues[k]
                    }
                    break
                  }
                  case 'deviceId':
                  case 'label':
                    break
                  case 'hideChannels': {
                    if (typeof v !== 'string' || v === '') {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      const channels = v.split(',')
                      channels.forEach(channel => {
                        this.hideChannels.push(
                          id + 'SW' + channel.replace(/[^0-9]+/g, '')
                        )
                      })
                    }
                    break
                  }
                  case 'hideLight':
                  case 'hideLongDouble':
                  case 'hideSwitch':
                  case 'overrideDisabledLogging':
                  case 'scaleBattery':
                  case 'showAsOutlet':
                  case 'showAsSwitch':
                    if (typeof v === 'string') {
                      logQuotes(key + '.' + id + '.' + k)
                    }
                    this[key][id][k] = v === 'false' ? false : !!v
                    break
                  case 'ipAddress': {
                    if (typeof v !== 'string' || v === '') {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      this.ipOverride[id] = v
                    }
                    break
                  }
                  case 'offset': {
                    if (typeof v === 'string') {
                      logQuotes(key + '.' + id + '.' + k)
                    }
                    const numVal = Number(v)
                    if (isNaN(numVal)) {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      this[key][id][k] = numVal
                    }
                    break
                  }
                }
              }
            })
          } else {
            logIgnore(key)
          }
          break
        case 'groups':
          if (Array.isArray(val) && val.length > 0) {
            val.forEach(x => {
              if (!x.type || !x.deviceId) {
                logIgnoreItem(key)
                return
              }
              const id = this.funcs.parseDeviceId(x.deviceId)
              const entries = Object.entries(x)
              if (entries.length === 1) {
                logRemove(key + '.' + id)
                return
              }
              this.simulations[id] = {}
              for (const [k, v] of entries) {
                switch (k) {
                  case 'deviceId':
                  case 'label':
                    break
                  case 'ipAddress': {
                    if (typeof v !== 'string' || v === '') {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      this.ipOverride[id] = v
                    }
                    break
                  }
                  case 'obstructId':
                    if (typeof v !== 'string' || v === '') {
                      logIgnore(key + '.' + id + '.' + k)
                    } else if (!this.consts.allowed.obstructs.includes(x.type)) {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      const parsed = this.funcs.parseDeviceId(v)
                      this.simulations[id].obstructId = parsed
                      this.obstructSwitches[parsed] = id
                    }
                    break
                  case 'operationTime': {
                    if (typeof v === 'string') {
                      logQuotes(key + '.' + id + '.' + k)
                    }
                    const intVal = parseInt(v)
                    if (isNaN(intVal)) {
                      logDefault(key + '.' + id + '.' + k, this.consts.defaultValues[k])
                      this.simulations[id][k] = this.consts.defaultValues[k]
                    } else if (intVal < this.consts.minValues[k]) {
                      logIncrease(key + '.' + id + '.' + k, this.consts.minValues[k])
                      this.simulations[id][k] = this.consts.minValues[k]
                    } else {
                      this.simulations[id][k] = intVal
                    }
                    break
                  }
                  case 'overrideDisabledLogging':
                    if (typeof v === 'string') {
                      logQuotes(key + '.' + id + '.' + k)
                    }
                    this.simulations[id][k] = v === 'false' ? false : !!v
                    break
                  case 'sensorId':
                    if (typeof v !== 'string' || v === '') {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      const parsed = this.funcs.parseDeviceId(v)
                      this.simulations[id].sensorId = parsed
                    }
                    break
                  case 'setup':
                    if (typeof v !== 'string' || v === '') {
                      logIgnore(key + '.' + id + '.' + k)
                    } else if (!this.consts.allowed.setups.includes(v)) {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      this.simulations[id][k] = v
                    }
                    break
                  case 'type':
                    if (typeof v !== 'string' || v === '') {
                      logIgnore(key + '.' + id + '.' + k)
                    } else if (!this.consts.allowed.groupTypes.includes(x.type)) {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      this.simulations[id][k] = v
                    }
                    break
                  default:
                    logRemove(key + '.' + id + '.' + k)
                    break
                }
              }
            })
          } else {
            logIgnore(key)
          }
          break
        case 'ignoredDevices': {
          if (Array.isArray(val)) {
            if (val.length > 0) {
              val.forEach(deviceId => {
                this.config.ignoredDevices.push(
                  this.funcs.parseDeviceId(deviceId)
                )
              })
            } else {
              logRemove(key)
            }
          } else {
            logIgnore(key)
          }
          break
        }
        case 'mode': {
          const inSet = this.consts.allowed.modes.includes(val)
          if (typeof val !== 'string' || !inSet) {
            logIgnore(key)
          }
          this.config.mode = inSet ? val : this.consts.defaultValues[key]
          break
        }
        case 'name':
        case 'platform':
        case 'plugin_map':
          break
        case 'password':
          if (typeof val !== 'string' || val === '') {
            throw new Error(this.messages.missingPW)
          }
          this.config.password = val
          break
        case 'username':
          if (typeof val !== 'string' || val === '') {
            throw new Error(this.messages.missingUN)
          }
          this.config.username = val.replace(/[\s]+/g, '')
          break
      }
    }
  }

  async pluginSetup () {
    // Plugin has finished initialising so now onto setup
    try {
      // If the user has disabled the plugin then remove all accessories
      if (this.config.disablePlugin) {
        this.devicesInHB.forEach(accessory => {
          this.removeAccessory(accessory)
        })
        throw new Error(this.messages.disabled)
      }

      // Log that the plugin initialisation has been successful
      this.log('[v%s] %s.', PLUGIN.version, this.messages.initialised)

      // Require any libraries that the plugin uses
      this.axios = require('axios')
      this.crypto = require('crypto')
      this.colourUtils = require('./utils/colour-utils')
      this.eveService = require('./fakegato/fakegato-history')(this.api)
      const { default: PQueue } = require('p-queue')

      // Create the queue used for HTTP requests
      this.queue = new PQueue({
        interval: 250,
        intervalCap: 1,
        timeout: 10000
      })

      // Set up the HTTP client, get the user HTTP host, and login
      this.httpClient = new (require('./connection/http'))(this)
      await this.httpClient.getHost()
      const authData = await this.httpClient.login()

      // Get a device list and add to the devicesInEW map
      const deviceList = await this.httpClient.getDevices()
      deviceList.forEach(device => {
        this.devicesInEW.set(device.deviceid, device)
      })

      // Set up the WS client, get the user WS host, and login
      if (this.config.mode !== 'lan') {
        this.wsClient = new (require('./connection/ws'))(this, authData)
        await this.wsClient.getHost()
        this.wsClient.login()
      }

      // Set up the LAN client, scan for devices and start monitoring
      if (this.config.mode !== 'wan') {
        this.lanClient = new (require('./connection/lan'))(this, deviceList)
        this.lanDevices = await this.lanClient.getHosts()
        await this.lanClient.startMonitor()
      }

      // Remove HB accessories that are no longer in eWeLink account
      this.devicesInHB.forEach(accessory => {
        if (!this.devicesInEW.has(accessory.context.eweDeviceId)) {
          this.removeAccessory(accessory)
        }
      })

      // Initialise each device into HB
      this.devicesInEW.forEach(device => this.initialiseDevice(device))

      // Set up the WS and LAN listener for device updates
      if (this.wsClient) {
        this.wsClient.receiveUpdate(device => this.receiveDeviceUpdate(device))
      }
      if (this.lanClient) {
        this.lanClient.receiveUpdate(device => this.receiveDeviceUpdate(device))
      }

      // Refresh the WS connection every 60 minutes
      if (this.wsClient) {
        this.wsRefresh = setInterval(async () => {
          try {
            if (this.config.debug) {
              this.log('%s.', this.messages.wsRef)
            }
            await this.wsClient.getHost()
            await this.wsClient.closeConnection()
            await this.funcs.sleep(250)
            await this.wsClient.login()
          } catch (e) {
            const eText = this.funcs.parseError(e)
            this.log.warn('%s %s.', this.messages.wsRefFail, eText)
          }
        }, 3600000)
      }

      // Log that the plugin setup has been successful with a welcome message
      const randIndex = Math.floor(Math.random() * this.consts.welcomeMessages.length)
      this.log('%s. %s', this.messages.complete, this.consts.welcomeMessages[randIndex])
    } catch (err) {
      // Catch any errors during setup
      const eText = err.message === this.messages.disabled
        ? err.message
        : this.funcs.parseError(err)
      this.log.warn('***** %s [v%s]. *****', this.messages.disabling, PLUGIN.version)
      this.log.warn('***** %s. *****', eText)
      this.pluginShutdown()
    }
  }

  pluginShutdown () {
    // A function that is called when the plugin fails to load or Homebridge restarts
    try {
      // Stop the LAN monitoring
      if (this.lanClient) {
        this.lanClient.closeConnection()
      }

      // Close the WS connection
      if (this.wsClient) {
        clearInterval(this.wsRefresh)
        this.wsClient.closeConnection()
      }
    } catch (err) {
      // No need to show errors at this point
    }
  }

  initialiseDevice (device) {
    let accessory
    let oAccessory
    try {
      // Remove old sub accessories for Accessory Simulations
      if (this.simulations[device.deviceid]) {
        for (let i = 0; i <= 4; i++) {
          if (this.devicesInHB.has(device.deviceid + 'SW' + i)) {
            this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SW' + i))
          }
        }
      }

      // Set up the correct instance for this particular device
      if (this.consts.devices.curtain.includes(device.extra.uiid)) {
        /***********************
        BLINDS [EWELINK UIID 11]
        ***********************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/curtain'))(this, accessory)
        /**********************/
      } else if (
        this.simulations[device.deviceid] &&
        this.simulations[device.deviceid].type === 'blind'
      ) {
        /****************************
        BLINDS [ACCESSORY SIMULATION]
        ****************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/blind'))(this, accessory)
        /***************************/
      } else if (this.obstructSwitches[device.deviceid]) {
        /*****************************
        OBSTRUCTION DETECTION SWITCHES
        *****************************/
        const instance = './device/simulation/garage-od-switch'
        accessory = this.addAccessory(device, device.deviceid + 'SWX', true)
        accessory.control = new (require(instance))(this, accessory)
        /****************************/
      } else if (
        this.simulations[device.deviceid] &&
        this.simulations[device.deviceid].type === 'garage'
      ) {
        /****************************************
        GARAGE DOORS [ONE] [ACCESSORY SIMULATION]
        ****************************************/
        const instance = './device/simulation/garage-one'
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require(instance))(this, accessory)
        /***************************************/
      } else if (
        this.simulations[device.deviceid] &&
        this.simulations[device.deviceid].type === 'garage_two'
      ) {
        /****************************************
        GARAGE DOORS [TWO] [ACCESSORY SIMULATION]
        ****************************************/
        const instance = './device/simulation/garage-two'
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require(instance))(this, accessory)
        /***************************************/
      } else if (
        this.simulations[device.deviceid] &&
        this.simulations[device.deviceid].type === 'garage_four'
      ) {
        /*****************************************
        GARAGE DOORS [FOUR] [ACCESSORY SIMULATION]
        *****************************************/
        const instance = './device/simulation/garage-four'
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require(instance))(this, accessory)
        /****************************************/
      } else if (
        this.simulations[device.deviceid] &&
        this.simulations[device.deviceid].type === 'garage_eachen'
      ) {
        /***************************
        GARAGE DOORS [EACHEN GD-DC5]
        ***************************/
        const instance = './device/simulation/garage-eachen'
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require(instance))(this, accessory)
        /**************************/
      } else if (
        this.simulations[device.deviceid] &&
        this.simulations[device.deviceid].type === 'lock'
      ) {
        /***************************
        LOCKS [ACCESSORY SIMULATION]
        ***************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/lock-one'))(this, accessory)
        /**************************/
      } else if (
        this.simulations[device.deviceid] &&
        this.simulations[device.deviceid].type === 'switch_valve'
      ) {
        /**********************************
        SWITCH-VALVE [ACCESSORY SIMULATION]
        **********************************/
        const instance = './device/simulation/switch-valve'
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require(instance))(this, accessory)
        /*********************************/
      } else if (
        this.simulations[device.deviceid] &&
        this.simulations[device.deviceid].type === 'tap'
      ) {
        /********************************
        TAPS [ONE] [ACCESSORY SIMULATION]
        ********************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/tap-one'))(this, accessory)
        /*******************************/
      } else if (
        this.simulations[device.deviceid] &&
        this.simulations[device.deviceid].type === 'tap_two'
      ) {
        /********************************
        TAPS [TWO] [ACCESSORY SIMULATION]
        ********************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/tap-two'))(this, accessory)
        /*******************************/
      } else if (
        this.simulations[device.deviceid] &&
        this.simulations[device.deviceid].type === 'valve'
      ) {
        /**********************************
        VALVES [ONE] [ACCESSORY SIMULATION]
        **********************************/
        const instance = './device/simulation/valve-one'
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require(instance))(this, accessory)
        /*********************************/
      } else if (
        this.simulations[device.deviceid] &&
        this.simulations[device.deviceid].type === 'valve_two'
      ) {
        /**********************************
        VALVES [TWO] [ACCESSORY SIMULATION]
        **********************************/
        const instance = './device/simulation/valve-two'
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require(instance))(this, accessory)
        /*********************************/
      } else if (
        this.simulations[device.deviceid] &&
        this.simulations[device.deviceid].type === 'valve_four'
      ) {
        /***********************************
        VALVES [FOUR] [ACCESSORY SIMULATION]
        ***********************************/
        const instance = './device/simulation/valve-four'
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require(instance))(this, accessory)
        /**********************************/
      } else if (
        this.simulations[device.deviceid] &&
        this.simulations[device.deviceid].type === 'sensor_leak' &&
        this.consts.devices.sensorContact.includes(device.extra.uiid)
      ) {
        /**************************************
        SENSORS [LEAK DW2 ACCESSORY SIMULATION]
        **************************************/
        const instance = './device/simulation/sensor-leak'
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require(instance))(this, accessory)
        /*************************************/
      } else if (this.consts.devices.sensorContact.includes(device.extra.uiid)) {
        /*******************
        SENSORS [SONOFF DW2]
        *******************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/sensor-contact'))(this, accessory)
        /******************/
      } else if (this.consts.devices.fan.includes(device.extra.uiid)) {
        /***
        FANS
        ***/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/fan'))(this, accessory)
        /**/
      } else if (this.consts.devices.diffuser.includes(device.extra.uiid)) {
        /********
        DIFFUSERS
        ********/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/diffuser'))(this, accessory)
        /*******/
      } else if (this.consts.devices.humidifier.includes(device.extra.uiid)) {
        /**********
        HUMIDIFIERS
        **********/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/humidifier'))(this, accessory)
        /*********/
      } else if (this.consts.devices.thermostat.includes(device.extra.uiid)) {
        /**********
        THERMOSTATS
        **********/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/thermostat'))(this, accessory)
        /*******/
      } else if (
        this.simulations[device.deviceid] &&
        this.simulations[device.deviceid].type === 'thermostat' &&
        this.consts.devices.sensorAmbient.includes(device.extra.uiid)
      ) {
        /*********************************
        THERMOSTATS [ACCESSORY SIMULATION]
        *********************************/
        const instance = './device/simulation/thermostat'
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require(instance))(this, accessory)
        /********************************/
      } else if (this.consts.devices.sensorAmbient.includes(device.extra.uiid)) {
        /***********************
        SENSOR [AMBIENT-TH10/16]
        ***********************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.context.sensorType = device.params.sensorType
        accessory.control = new (require('./device/sensor-ambient'))(this, accessory)
        /**********************/
      } else if (
        this.consts.devices.outlet.includes(device.extra.uiid) ||
        (
          this.consts.devices.singleSwitch.includes(device.extra.uiid) &&
          this.consts.devices.singleSwitchOutlet.includes(device.productModel)
        )
      ) {
        /******
        OUTLETS
        ******/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = this.outletDevices[device.deviceid] &&
          this.outletDevices[device.deviceid].showAsSwitch
          ? new (require('./device/switch-single'))(this, accessory)
          : new (require('./device/outlet'))(this, accessory)
        /*****/
      } else if (this.consts.devices.outletSCM.includes(device.extra.uiid)) {
        /*************************************
        OUTLETS [SINGLE BUT MULTIPLE HARDWARE]
        *************************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/outlet-scm'))(this, accessory)
        /************************************/
      } else if (this.consts.devices.cTempable.includes(device.extra.uiid)) {
        /*******************
        LIGHTS [COLOUR TEMP]
        *******************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/light-ctemp'))(this, accessory)
        /******************/
      } else if (this.consts.devices.colourable.includes(device.extra.uiid)) {
        /******************
        LIGHTS [COLOUR RGB]
        ******************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/light-colour'))(this, accessory)
        /*****************/
      } else if (this.consts.devices.brightable.includes(device.extra.uiid)) {
        /**************
        LIGHTS [DIMMER]
        **************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/light-dimmer'))(this, accessory)
        /*************/
      } else if (this.consts.devices.singleSwitch.includes(device.extra.uiid)) {
        /************************
        SWITCHES [SINGLE CHANNEL]
        ************************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = this.singleDevices[device.deviceid] &&
          this.singleDevices[device.deviceid].showAsOutlet
          ? new (require('./device/outlet'))(this, accessory)
          : new (require('./device/switch-single'))(this, accessory)
        /***********************/
      } else if (this.consts.devices.multiSwitch.includes(device.extra.uiid)) {
        /***********************
        SWITCHES [MULTI CHANNEL]
        ***********************/
        for (let i = 0; i <= this.consts.supportedDevices[device.extra.uiid]; i++) {
          // Check if the user has chosen to hide any channels for this device
          if (this.hideChannels.includes(device.deviceid + 'SW' + i)) {
            // The user has hidden this channel so if it exists then remove it
            if (this.devicesInHB.has(device.deviceid + 'SW' + i)) {
              this.removeAccessory(this.devicesInHB.get(device.deviceid + 'SW' + i))
            }

            // If this is the main channel then add it to the array of hidden masters
            if (i === 0) {
              this.hideMasters.push(device.deviceid)
            }

            // Add the sub accessory, but hidden, to Homebridge
            oAccessory = this.addAccessory(device, device.deviceid + 'SW' + i, true)
          } else {
            // The user has not hidden this channel
            oAccessory = this.devicesInHB.has(device.deviceid + 'SW' + i)
              ? this.devicesInHB.get(device.deviceid + 'SW' + i)
              : this.addAccessory(device, device.deviceid + 'SW' + i)
          }

          // Add context information to the sub accessory
          oAccessory.context.firmware = device.params.fwVersion || PLUGIN.version
          oAccessory.context.reachableWAN = device.online
          oAccessory.context.reachableLAN = this.lanClient &&
            this.lanDevices.has(device.deviceid)
            ? this.lanDevices.get(device.deviceid).ip
            : false
          oAccessory.context.eweBrandName = device.brandName
          oAccessory.context.eweBrandLogo = device.brandLogo
          oAccessory.context.eweShared = device.sharedBy && device.sharedBy.email
            ? device.sharedBy.email
            : false
          oAccessory.context.ip = this.lanClient && oAccessory.context.reachableLAN
            ? this.lanDevices.get(device.deviceid).ip
            : false
          oAccessory.control = new (require('./device/switch-multi'))(this, oAccessory)

          // Update any changes to the sub accessory to the platform
          this.api.updatePlatformAccessories(PLUGIN.name, PLUGIN.alias, [oAccessory])
          this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory)
          if (i === 0) {
            accessory = oAccessory
          }
        }
        /**********************/
      } else if (this.consts.devices.rfBridge.includes(device.extra.uiid)) {
        /*********************
        RF BRIDGE + SUBDEVICES
        *********************/
        let rfChlCounter = 0

        // Make an array of sub devices connected to the RF Bridge
        const rfMap = []
        if (device.tags && device.tags.zyx_info) {
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

        // We don't want to add the main bridge as an accessory in Homebridge
        this.hideMasters.push(device.deviceid)

        // Loop through each sub device connected to the RF Bridge
        rfMap.forEach(subDevice => {
          const swNumber = rfChlCounter + 1
          let subType
          let sensorTimeLength
          let sensorTimeDiff
          let subExtraContext = {}
          const fullDeviceId = device.deviceid + 'SW' + swNumber
          const disableDeviceLogging = this.rfDevices[fullDeviceId] &&
            this.rfDevices[fullDeviceId].overrideDisabledLogging
            ? false
            : this.config.disableDeviceLogging

          // Check which eWeLink type the connected sub device is
          if (['1', '2', '3', '4'].includes(subDevice.type)) {
            subType = 'button'
          } else if (subDevice.type === '5') {
            subType = 'curtain'
          } else if (subDevice.type === '6') {
            subType = this.rfDevices[fullDeviceId]
              ? this.rfDevices[fullDeviceId].type
              : 'motion'
            sensorTimeLength = this.rfDevices[fullDeviceId] &&
              this.rfDevices[fullDeviceId].sensorTimeLength
              ? this.rfDevices[fullDeviceId].sensorTimeLength
              : this.consts.defaultValues.sensorTimeLength
            sensorTimeDiff = this.rfDevices[fullDeviceId] &&
              this.rfDevices[fullDeviceId].sensorTimeDifference
              ? this.rfDevices[fullDeviceId].sensorTimeDifference
              : this.consts.defaultValues.sensorTimeDifference
          } else {
            const type = subDevice.type || '?'
            this.log.warn('[%s] %s [%s].', device.name, this.messages.unsupDev, type)
            return
          }

          // Create an object to save to the sub accessory context
          subExtraContext = {
            buttons: subDevice.buttons,
            subType,
            swNumber,
            sensorTimeLength,
            sensorTimeDiff,
            disableDeviceLogging,
            name: subDevice.name
          }

          // Check if the sub accessory already exists in Homebridge
          if ((oAccessory = this.devicesInHB.get(fullDeviceId))) {
            // Check for any changes to user config or types
            if (
              oAccessory.context.subType !== subType ||
              oAccessory.context.sensorTimeLength !== sensorTimeLength ||
              oAccessory.context.sensorTimeDiff !== sensorTimeDiff ||
              oAccessory.context.disableDeviceLogging !== disableDeviceLogging ||
              oAccessory.context.swNumber !== swNumber
            ) {
              // Remove the existing sub accessory if any changes are found
              this.removeAccessory(oAccessory)
            }
          }

          // Get the sub accessory if it's new or hasn't been removed above
          oAccessory = this.devicesInHB.has(fullDeviceId)
            ? this.devicesInHB.get(fullDeviceId)
            : this.addAccessory(device, fullDeviceId, false, subExtraContext, 'rf_sub')

          // Add context information to the sub accessory
          oAccessory.context.firmware = device.params.fwVersion || PLUGIN.version
          oAccessory.context.reachableWAN = device.online
          oAccessory.context.reachableLAN = false
          oAccessory.context.eweBrandName = device.brandName
          oAccessory.context.eweBrandLogo = device.brandLogo
          oAccessory.context.eweShared = device.sharedBy && device.sharedBy.email
            ? device.sharedBy.email
            : false
          oAccessory.context.ip = this.lanClient && oAccessory.context.reachableLAN
            ? this.lanDevices.get(device.deviceid).ip
            : false

          // Update any changes to the sub accessory to the platform
          this.api.updatePlatformAccessories(PLUGIN.name, PLUGIN.alias, [oAccessory])
          this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory)
          oAccessory.control = new (require('./device/rf-bridge'))(this, oAccessory)
          rfChlCounter += Object.keys(subDevice.buttons || {}).length
        })

        // Update any changes to the accessory to the platform
        accessory.context.channelCount = rfChlCounter
        /********************/
      } else if (this.consts.devices.zbBridge.includes(device.extra.uiid)) {
        /************
        ZIGBEE BRIDGE
        ************/
        return
        /***********/
      } else if (this.consts.devices.zbSwitchStateless.includes(device.extra.uiid)) {
        /**********************
        ZIGBEE STATELESS SWITCH
        **********************/
        const instance = './device/zigbee/switch-stateless'
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require(instance))(this, accessory)
        /*********************/
      } else if (this.consts.devices.zbSwitchSingle.includes(device.extra.uiid)) {
        /***************
        ZB SINGLE SWITCH
        ***************/
        const instance = './device/zigbee/switch-single'
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require(instance))(this, accessory)
        /**************/
      } else if (this.consts.devices.zbLightDimmer.includes(device.extra.uiid)) {
        /*****************
        ZB LIGHTS [DIMMER]
        *****************/
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/zigbee/light-dimmer'))(this, accessory)
        /****************/
      } else if (this.consts.devices.zbSensorAmbient.includes(device.extra.uiid)) {
        /******************
        ZB SENSOR [AMBIENT]
        ******************/
        const instance = './device/zigbee/sensor-ambient'
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require(instance))(this, accessory)
        /*****************/
      } else if (this.consts.devices.zbSensorMotion.includes(device.extra.uiid)) {
        /*****************
        ZB SENSOR [MOTION]
        *****************/
        const instance = './device/zigbee/sensor-motion'
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require(instance))(this, accessory)
        /****************/
      } else if (this.consts.devices.zbSensorContact.includes(device.extra.uiid)) {
        /******************
        ZB SENSOR [CONTACT]
        ******************/
        const instance = './device/zigbee/sensor-contact'
        accessory = this.devicesInHB.has(device.deviceid + 'SWX')
          ? this.devicesInHB.get(device.deviceid + 'SWX')
          : this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require(instance))(this, accessory)
        /*****************/
      } else if (this.consts.devices.camera.includes(device.extra.uiid)) {
        /*************
        SONOFF CAMERAS
        *************/
        this.log('[%s] %s.', device.name, this.messages.sonoffCamera)
        return
        /************/
      } else if (this.consts.devices.eWeCamera.includes(device.extra.uiid)) {
        /******************
        EWELINK APP CAMERAS
        ******************/
        this.log('[%s] %s.', device.name, this.messages.devNotSup)
        return
        /*****************/
      } else {
        /**************
        UNKNOWN DEVICES
        **************/
        const uiid = device.extra.uiid || '?'
        this.log.warn('[%s] %s [%s].', device.name, this.messages.devNotSupYet, uiid)
        return
        /*************/
      }

      // Update the reachability values (via WS and LAN)
      accessory.context.firmware = device.params.fwVersion || PLUGIN.version
      accessory.context.reachableWAN = device.online
      accessory.context.reachableLAN = this.lanClient &&
        this.lanDevices.has(device.deviceid)
        ? this.lanDevices.get(device.deviceid).ip
        : false
      accessory.context.eweBrandName = device.brandName
      accessory.context.eweBrandLogo = device.brandLogo
      accessory.context.eweShared = device.sharedBy && device.sharedBy.email
        ? device.sharedBy.email
        : false
      accessory.context.ip = this.lanClient && accessory.context.reachableLAN
        ? this.lanDevices.get(device.deviceid).ip
        : false

      // Helpful logging for each device
      const str = accessory.context.reachableLAN
        ? this.messages.foundWithIP + ' [' + this.lanDevices.get(device.deviceid).ip + ']'
        : this.consts.devices.lan.includes(device.extra.uiid)
          ? this.messages.lanUnreachable
          : this.messages.lanUnsupported

      // Update accessory characteristics with latest values
      if (this.wsClient && accessory.control && accessory.control.externalUpdate) {
        accessory.control.externalUpdate(device.params)
      }

      // Update any changes to the device into our devicesInHB map
      this.api.updatePlatformAccessories(PLUGIN.name, PLUGIN.alias, [accessory])
      this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
      this.log('[%s] %s %s.', device.name, this.messages.devInit, str)
    } catch (err) {
      // Catch any errors during initialisation
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', device.name, this.messages.devNotInit, eText)
    }
  }

  addAccessory (device, hbDeviceId, hidden = false, extraContext = {}, type = '') {
    // Add an accessory to Homebridge
    let newDeviceName
    try {
      // Get the switchNumber which can be {X, 0, 1, 2, 3, 4, ...}
      const switchNumber = hbDeviceId.split('SW')[1].toString()
      const channelCount = type === 'rf_pri'
        ? Object.keys((device.tags && device.tags.zyx_info) || []).length
        : this.consts.supportedDevices[device.extra.uiid]

      // Set up the device name which can depend on the accessory type
      if (type === 'rf_sub') {
        // RF accessories have their name stored in the context
        newDeviceName = extraContext.name
      } else {
        // Other accessories store the name initially as the device name
        newDeviceName = device.name

        // Check if it's a channel of a multi-channel device
        if (['1', '2', '3', '4'].includes(switchNumber)) {
          // Try and obtain the eWeLink channel name
          if (
            device.tags &&
            device.tags.ck_channel_name &&
            device.tags.ck_channel_name[parseInt(switchNumber) - 1]
          ) {
            // Found the eWeLink channel name
            newDeviceName = device.tags.ck_channel_name[parseInt(switchNumber) - 1]
          } else {
            // Didn't find the eWeLink channel name use generic SW channel
            newDeviceName += ' SW' + switchNumber
          }
        }
      }

      // Add the new accessory to Homebridge
      const accessory = new this.api.platformAccessory(
        newDeviceName,
        this.api.hap.uuid.generate(hbDeviceId)
      )

      // If it isn't a hidden device then set the accessory characteristics
      if (!hidden) {
        accessory.getService(this.api.hap.Service.AccessoryInformation)
          .setCharacteristic(this.api.hap.Characteristic.SerialNumber, hbDeviceId)
          .setCharacteristic(this.api.hap.Characteristic.Manufacturer, device.brandName)
          .setCharacteristic(
            this.api.hap.Characteristic.Model,
            device.productModel + ' (' + device.extra.model + ')'
          )
          .setCharacteristic(
            this.api.hap.Characteristic.FirmwareRevision,
            device.params.fwVersion || PLUGIN.version
          )
          .setCharacteristic(this.api.hap.Characteristic.Identify, true)

        // A function for when the identify button is pressed in HomeKit apps
        accessory.on('identify', (paired, callback) => {
          callback()
          this.log('[%s] %s.', accessory.displayName, this.messages.identify)
        })
      }

      // Add helpful context values to the accessory
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

      // Register the accessory if it hasn't been hidden by the user
      if (!hidden) {
        this.api.registerPlatformAccessories(PLUGIN.name, PLUGIN.alias, [accessory])
        this.log('[%s] %s.', newDeviceName, this.messages.devAdd)
      }

      // Return the new accessory
      return accessory
    } catch (err) {
      // Catch any errors during add
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', newDeviceName, this.messages.devNotAdd, eText)
      return false
    }
  }

  configureAccessory (accessory) {
    // Function is called to retrieve each accessory from the cache on startup
    try {
      if (!this.log) {
        return
      }

      // Set the correct firmware version if we can
      if (this.api && accessory.context.firmware) {
        accessory.getService(this.api.hap.Service.AccessoryInformation)
          .updateCharacteristic(
            this.api.hap.Characteristic.FirmwareRevision,
            accessory.context.firmware
          )
      }

      this.devicesInHB.set(accessory.context.hbDeviceId, accessory)
    } catch (err) {
      // Catch any errors during retrieve
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.devNotConf, eText)
    }
  }

  removeAccessory (accessory) {
    try {
      // Remove an accessory from Homebridge
      this.api.unregisterPlatformAccessories(PLUGIN.name, PLUGIN.alias, [accessory])
      this.devicesInHB.delete(accessory.context.hbDeviceId)
      this.log('[%s] %s.', accessory.displayName, this.messages.devRemove)
    } catch (err) {
      // Catch any errors during remove
      const eText = this.funcs.parseError(err)
      const name = accessory.displayName
      this.log.warn('[%s] %s %s.', name, this.messages.devNotRemove, eText)
    }
  }

  async sendDeviceUpdate (accessory, params) {
    // Add to a queue so multiple updates are at least 500ms apart
    return await this.queue.add(async () => {
    // Log the update being sent
      if (this.config.debug) {
        const str = JSON.stringify(params)
        this.log('[%s] %s %s.', accessory.displayName, this.messages.updSend, str)
      }

      // Set up the payload to send via LAN/WS
      const payload = {
        apikey: accessory.context.eweApiKey,
        deviceid: accessory.context.eweDeviceId,
        params
      }

      // Quick check to see if LAN mode is supported
      const res = !this.lanClient
        ? this.messages.lanDisabled
        : !this.consts.devices.lan.includes(accessory.context.eweUIID)
          ? this.messages.lanNotSup
          : await this.lanClient.sendUpdate(payload)

      // Revert to WS if LAN mode not possible for whatever reason
      if (res !== 'ok') {
      // Check to see if the device is online
        if (this.wsClient && accessory.context.reachableWAN) {
        // Log the revert if appropriate
          if (this.config.debug) {
            this.log('[%s] %s %s.', accessory.displayName, this.messages.revertWS, res)
          }

          // Device is online via WS so send the update
          await this.wsClient.sendUpdate(payload)
        } else {
        // Device isn't online via WS so report the error back
          let eText = this.messages.unreachable
          if (![this.messages.lanDisabled, this.messages.lanNotSup].includes(res)) {
            eText += ' [' + res + ']'
          }
          throw new Error(eText)
        }
      }
    })
  }

  async receiveDeviceUpdate (device) {
    const deviceId = device.deviceid
    let accessory
    let reachableChange = false

    // Find our accessory for which the updates relates to
    if ((
      accessory = this.devicesInHB.get(deviceId + 'SWX') ||
        this.devicesInHB.get(deviceId + 'SW0'))
    ) {
      if (this.config.debug) {
        const str = JSON.stringify(device.params)
        this.log('[%s] %s %s.', accessory.displayName, this.messages.updRec, str)
      }
      if (device.params.updateSource === 'WS') {
        // The update is from WS so update the WS online/offline status
        if (device.params.online !== accessory.context.reachableWAN) {
          accessory.context.reachableWAN = device.params.online
          this.devicesInHB.set(accessory.context.hbDeviceId, accessory)

          // Flag this true to update the sub accessories later
          reachableChange = true

          // Log the new reachability of the device
          const status = accessory.context.reachableWAN
            ? this.messages.repOnline
            : this.messages.repOffline
          this.log('[%s] %s %s.', accessory.displayName, status, this.messages.viaWS)

          // Try and request an update through WS if the device has come back online
          if (accessory.context.reachableWAN && this.wsClient) {
            try {
              this.wsClient.requestUpdate(accessory)
            } catch (err) {
              // Suppress any errors here
            }
          }
        }
      }
      if (device.params.updateSource === 'LAN' && !accessory.context.reachableLAN) {
        // The update is from LAN so it must be online
        accessory.context.reachableLAN = true
        this.devicesInHB.set(accessory.context.hbDeviceId, accessory)

        // Flag this true to update the sub accessories later
        reachableChange = true

        // Log the new reachability of the device
        const name = accessory.displayName
        this.log('[%s] %s %s.', name, this.messages.repOnline, this.messages.viaLAN)

        // Try and request an update through WS if the device has come back online
        if (accessory.context.reachableWAN && this.wsClient) {
          try {
            this.wsClient.requestUpdate(accessory)
          } catch (err) {
            // Suppress any errors here
          }
        }
      }

      // Update this new online/offline status for all switches of multi channel devices
      if (reachableChange && accessory.context.hbDeviceId.substr(-1) !== 'X') {
        // Loop through to see which channels are in HB
        for (let i = 1; i <= accessory.context.channelCount; i++) {
          if (this.devicesInHB.has(deviceId + 'SW' + i)) {
            // Find the sub accessory
            const oAccessory = this.devicesInHB.get(deviceId + 'SW' + i)

            // Update the WAN status
            oAccessory.context.reachableWAN = device.params.online

            // Update the LAN status
            if (device.params.updateSource === 'LAN') {
              oAccessory.context.reachableLAN = true
            }

            // Save the sub accessory updates to the platform
            this.devicesInHB.set(oAccessory.context.hbDeviceId, oAccessory)
          }
        }
      }
      try {
        // Update the accessory with the new data
        if (accessory.control && accessory.control.externalUpdate) {
          accessory.control.externalUpdate(device.params)
        }
      } catch (err) {
        const eText = this.funcs.parseError(err)
        this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.devNotRf, eText)
      }
    } else {
      // The device does not existing in HB so let's try to add it
      try {
        // Don't continue if the user has hidden this device
        if (this.config.ignoredDevices.includes(deviceId)) {
          return
        }

        // Log the update if debug is set to true
        if (this.config.debug) {
          const str = JSON.stringify(device.params)
          this.log('[%s] %s %s.', deviceId, this.messages.recNew, str)
        }

        // Obtain full device information from the HTTP API
        const newDevice = await this.httpClient.getDevice(deviceId)

        // Initialise the device in HB
        this.initialiseDevice(newDevice)

        // Add the device to the LAN client map
        if (this.lanClient && this.consts.devices.lan.includes(newDevice.extra.uiid)) {
          this.lanClient.addDeviceToMap(newDevice)
        }
      } catch (err) {
        // Automatically adding the new device failed for some reason
        const eText = this.funcs.parseError(err)
        this.log.warn('[%s] %s %s.', deviceId, this.messages.devNewNotAdd, eText)
      }
    }
  }

  async deviceUpdateError (accessory, err, requestRefresh) {
    // Log the error
    const eText = this.funcs.parseError(err)
    this.log.warn('[%s] %s %s.', accessory.displayName, this.messages.devNotUpd, eText)

    // We only request a device refresh on failed internal updates
    if (requestRefresh && accessory.context.reachableWAN && this.wsClient) {
      try {
        await this.wsClient.requestUpdate(accessory)
      } catch (err) {
        // Suppress any errors at this point
      }
    }
  }
}

// Export the plugin to Homebridge
module.exports = hb => hb.registerPlatform(PLUGIN.alias, eWeLinkPlatform)
