/* jshint node: true, esversion: 10, -W014, -W033 */
/* eslint-disable new-cap */
'use strict'

// Packages and constant variables for this class
const devicesInHB = new Map()
const http = require('http')
const { default: PQueue } = require('p-queue')
const plugin = require('./../package.json')
const queue = new PQueue({
  interval: 250,
  intervalCap: 1,
  timeout: 10000
})
const storage = require('node-persist')

// Variables for this class to use later
let apiClient
let apiServer
let httpClient
let lanClient
let lanDevices
let storageClient
let wsClient

// Create the platform class
class eWeLinkPlatform {
  constructor (log, config, api) {
    // Don't load the plugin if these aren't accessible for any reason
    if (!log || !api) {
      return
    }

    // Begin plugin initialisation
    try {
      this.api = api
      this.consts = require('./utils/constants')
      this.funcs = require('./utils/functions')
      this.log = log

      // Configuration objects for accessories
      this.deviceConf = {}
      this.rfSubdevices = {}
      this.hideChannels = []
      this.hideMasters = []
      this.ignoredDevices = []
      this.ipOverride = {}
      this.obstructSwitches = {}

      // Retrieve the user's chosen language file
      const lang = this.consts.allowed.language.includes(config.language)
        ? config.language
        : this.consts.defaultValues.language
      this.lang = require('./utils/lang-' + lang)

      // Make sure user is running Homebridge v1.3 or above
      if (!api.versionGreaterOrEqual || !api.versionGreaterOrEqual('1.3.0')) {
        throw new Error(this.lang.hbVersionFail)
      }

      // Check the user has configured the plugin
      if (!config) {
        throw new Error(this.lang.pluginNotConf)
      }

      // Log some environment info for debugging
      this.log(
        '%s v%s | Node %s | HB v%s%s...',
        this.lang.initialising,
        plugin.version,
        process.version,
        api.serverVersion,
        config.plugin_map
          ? ' | HOOBS v3'
          : require('os')
              .hostname()
              .includes('hoobs')
          ? ' | HOOBS v4'
          : ''
      )

      // Apply the user's configuration
      this.config = this.consts.defaultConfig
      this.applyUserConfig(config)

      // Set up the Homebridge events
      this.api.on('didFinishLaunching', () => this.pluginSetup())
      this.api.on('shutdown', () => this.pluginShutdown())
    } catch (err) {
      // Catch any errors during initialisation
      const eText = this.funcs.parseError(err, [this.lang.hbVersionFail, this.lang.pluginNotConf])
      log.warn('***** %s. *****', this.lang.disabling)
      log.warn('***** %s. *****', eText)
    }
  }

  applyUserConfig (config) {
    // These shorthand functions save line space during config parsing
    const logDefault = (k, def) => {
      this.log.warn('%s [%s] %s %s.', this.lang.cfgItem, k, this.lang.cfgDef, def)
    }
    const logDuplicate = k => {
      this.log.warn('%s [%s] %s.', this.lang.cfgItem, k, this.lang.cfgDup)
    }
    const logIgnore = k => {
      this.log.warn('%s [%s] %s.', this.lang.cfgItem, k, this.lang.cfgIgn)
    }
    const logIgnoreItem = k => {
      this.log.warn('%s [%s] %s.', this.lang.cfgItem, k, this.lang.cfgIgnItem)
    }
    const logIncrease = (k, min) => {
      this.log.warn('%s [%s] %s %s.', this.lang.cfgItem, k, this.lang.cfgLow, min)
    }
    const logQuotes = k => {
      this.log.warn('%s [%s] %s.', this.lang.cfgItem, k, this.lang.cfgQts)
    }
    const logRemove = k => {
      this.log.warn('%s [%s] %s.', this.lang.cfgItem, k, this.lang.cfgRmv)
    }

    // Begin applying the user's config
    for (const [key, val] of Object.entries(config)) {
      switch (key) {
        case 'apiPort': {
          if (typeof v === 'string') {
            logQuotes(key)
          }
          const intVal = parseInt(val)
          if (isNaN(intVal)) {
            logDefault(key, this.consts.defaultValues[key])
            this.config.apiPort = this.consts.defaultValues[key]
          } else if (intVal < this.consts.minValues[key]) {
            logIncrease(key, this.consts.minValues[key])
            this.config.apiPort = this.consts.minValues[key]
          } else {
            this.config.apiPort = intVal
          }
          break
        }
        case 'bridgeSensors':
          if (Array.isArray(val) && val.length > 0) {
            val.forEach(x => {
              if (!x.fullDeviceId) {
                logIgnoreItem(key)
                return
              }
              const id = this.funcs.parseDeviceId(x.fullDeviceId)
              if (Object.keys(this.rfSubdevices).includes(id)) {
                logDuplicate(key + '.' + id)
                return
              }
              const entries = Object.entries(x)
              if (entries.length === 1) {
                logRemove(key + '.' + id)
                return
              }
              this.rfSubdevices[id] = {}
              for (const [k, v] of entries) {
                switch (k) {
                  case 'curtainType':
                  case 'deviceType':
                  case 'overrideLogging':
                  case 'type': {
                    const index = k === 'type' ? 'sensorType' : k
                    const inSet = this.consts.allowed[index].includes(v)
                    if (typeof v !== 'string' || !inSet) {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      this.rfSubdevices[id][k] = inSet ? v : this.consts.defaultValues[k]
                    }
                    break
                  }
                  case 'fullDeviceId':
                  case 'label':
                    break
                  case 'operationTime':
                  case 'operationTimeDown':
                  case 'sensorTimeDifference':
                  case 'sensorTimeLength': {
                    if (typeof v === 'string') {
                      logQuotes(key + '.' + id + '.' + k)
                    }
                    const intVal = parseInt(v)
                    if (isNaN(intVal)) {
                      logDefault(key + '.' + id + '.' + k, this.consts.defaultValues[k])
                      this.rfSubdevices[id][k] = this.consts.defaultValues[k]
                    } else if (intVal < this.consts.minValues[k]) {
                      logIncrease(key + '.' + id + '.' + k, this.consts.minValues[k])
                      this.rfSubdevices[id][k] = this.consts.minValues[k]
                    } else {
                      this.rfSubdevices[id][k] = intVal
                    }
                    break
                  }
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
        case 'countryCode':
          if (typeof val !== 'string' || val === '') {
            logIgnore(key)
          } else {
            this.config.countryCode = '+' + val.replace(/[^0-9]/g, '')
          }
          break
        case 'debug':
        case 'debugFakegato':
        case 'disableDeviceLogging':
        case 'disableNoResponse':
        case 'disablePlugin':
          if (typeof val === 'string') {
            logQuotes(key)
          }
          this.config[key] = val === 'false' ? false : !!val
          break
        case 'fanDevices':
        case 'lightDevices':
        case 'multiDevices':
        case 'rfDevices':
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
              if (Object.keys(this.deviceConf).includes(id)) {
                logDuplicate(key + '.' + id)
                return
              }
              const entries = Object.entries(x)
              if (entries.length === 1) {
                logRemove(key + '.' + id)
                return
              }
              this.deviceConf[id] = {}
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
                  case 'minTarget':
                  case 'maxTarget':
                  case 'operationTime':
                  case 'operationTimeDown':
                  case 'sensorTimeDifference': {
                    if (typeof v === 'string') {
                      logQuotes(key + '.' + id + '.' + k)
                    }
                    const intVal = parseInt(v)
                    if (isNaN(intVal)) {
                      logDefault(key + '.' + id + '.' + k, this.consts.defaultValues[k])
                      this.deviceConf[id][k] = this.consts.defaultValues[k]
                    } else if (intVal < this.consts.minValues[k]) {
                      logIncrease(key + '.' + id + '.' + k, this.consts.minValues[k])
                      this.deviceConf[id][k] = this.consts.minValues[k]
                    } else {
                      this.deviceConf[id][k] = intVal
                    }
                    break
                  }
                  case 'deviceId':
                  case 'label':
                    break
                  case 'deviceModel':
                    if (typeof v !== 'string' || v === '') {
                      logIgnore(key + '.' + id + '.' + k)
                    } else if (!this.consts.allowed.models[key].includes(v)) {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      if (v === 'gddc5' && key === 'singleDevices') {
                        this.deviceConf[id].showAs = 'garage_eachen'
                      }
                    }
                    break
                  case 'hideChannels': {
                    if (typeof v !== 'string' || v === '') {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      const channels = v.split(',')
                      channels.forEach(channel => {
                        this.hideChannels.push(id + 'SW' + channel.replace(/[^0-9]+/g, ''))
                        this.deviceConf[id][k] = v
                      })
                    }
                    break
                  }
                  case 'hideLight':
                  case 'hideLongDouble':
                  case 'hideSensor':
                  case 'hideSwitch':
                  case 'humidityOffsetFactor':
                  case 'isInched':
                  case 'offsetFactor':
                  case 'resetOnStartup':
                  case 'scaleBattery':
                    if (typeof v === 'string') {
                      logQuotes(key + '.' + id + '.' + k)
                    }
                    this.deviceConf[id][k] = v === 'false' ? false : !!v
                    break
                  case 'humidityOffset':
                  case 'offset': {
                    if (typeof v === 'string') {
                      logQuotes(key + '.' + id + '.' + k)
                    }
                    const numVal = Number(v)
                    if (isNaN(numVal)) {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      this.deviceConf[id][k] = numVal
                    }
                    break
                  }
                  case 'ignoreDevice':
                    if (typeof v === 'string') {
                      logQuotes(key + '.' + id + '.' + k)
                    }
                    if (!!v && v !== 'false') {
                      this.ignoredDevices.push(id)
                    }
                    break
                  case 'inchChannels':
                    if (typeof v !== 'string' || v === '') {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      this.deviceConf[id][k] = v
                    }
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
                    } else {
                      const parsed = this.funcs.parseDeviceId(v)
                      this.deviceConf[id][k] = parsed
                      this.obstructSwitches[parsed] = id
                    }
                    break
                  case 'overrideLogging':
                  case 'sensorType':
                  case 'showAs':
                  case 'showAsEachen':
                  case 'showAsMotor': {
                    const inSet = this.consts.allowed[k].includes(v)
                    if (typeof v !== 'string' || !inSet) {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      this.deviceConf[id][k] = inSet ? v : this.consts.defaultValues[k]
                    }
                    break
                  }
                  case 'sensorId':
                    if (typeof v !== 'string' || v === '') {
                      logIgnore(key + '.' + id + '.' + k)
                    } else {
                      const parsed = this.funcs.parseDeviceId(v)
                      this.deviceConf[id].sensorId = parsed
                    }
                    break
                }
              }
            })
          } else {
            logIgnore(key)
          }
          break
        case 'httpHost': {
          const inSet = this.consts.allowed.httpHosts.includes(val)
          if (typeof val !== 'string' || !inSet) {
            logIgnore(key)
          }
          this.config.httpHost = inSet
            ? val === 'auto'
              ? this.consts.defaultValues[key]
              : val
            : this.consts.defaultValues[key]
          break
        }
        case 'language':
        case 'mode': {
          const inSet = this.consts.allowed[key].includes(val)
          if (typeof val !== 'string' || !inSet) {
            logIgnore(key)
          }
          this.config[key] = inSet ? val : this.consts.defaultValues[key]
          break
        }
        case 'name':
        case 'platform':
        case 'plugin_map':
          break
        case 'password':
          if (typeof val !== 'string') {
            logIgnore(key)
          } else {
            this.config.password = val
          }
          break
        case 'username':
          if (typeof val !== 'string') {
            logIgnore(key)
          } else {
            this.config.username = val.replace(/[\s]+/g, '')
          }
          break
        default:
          logRemove(key)
          break
      }
    }
  }

  async pluginSetup () {
    // Plugin has finished initialising so now onto setup
    try {
      // Log that the plugin initialisation has been successful
      this.log('%s.', this.lang.initialised)

      // If the user has disabled the plugin then remove all accessories
      if (this.config.disablePlugin) {
        devicesInHB.forEach(accessory => this.removeAccessory(accessory))
        throw new Error(this.lang.disabled)
      }

      // Check the eWeLink credentials are configured (except lan mode)
      if (this.config.mode !== 'lan' && (!this.config.username || !this.config.password)) {
        devicesInHB.forEach(accessory => this.removeAccessory(accessory))
        throw new Error(this.lang.missingCreds)
      }

      // Require any libraries that the accessory instances use
      this.colourUtils = require('./utils/colour-utils')
      this.cusChar = new (require('./utils/custom-chars'))(this.api)
      this.eveChar = new (require('./utils/eve-chars'))(this.api)
      this.eveService = require('./fakegato/fakegato-history')(this.api)

      // Persist files are used to store device info that could be used for LAN only mode
      try {
        await storage.init({
          dir: require('path').join(this.api.user.persistPath(), '/../homebridge-ewelink'),
          forgiveParseErrors: true
        })
        storageClient = true
      } catch (err) {
        if (this.config.debug) {
          const eText = this.funcs.parseError(err)
          this.log.warn('%s %s.', this.lang.storageSetupErr, eText)
        }
      }

      // Manually disable no response mode if mode is set to lan
      if (this.config.mode === 'lan') {
        this.config.disableNoResponse = true
      }

      const deviceList = []
      const groupList = []

      // Username and password are now optional
      if (this.config.username && this.config.password) {
        // Set up the HTTP client, get the user HTTP host, and login
        httpClient = new (require('./connection/http'))(this)
        const authData = await httpClient.login()
        this.config.password = authData.password

        // Get a home and device list via HTTP request
        await httpClient.getHomes()
        const { httpDeviceList, httpGroupList } = await httpClient.getDevices()
        httpDeviceList.forEach(device => deviceList.push(device))
        httpGroupList.forEach(group => groupList.push(group))

        // Set up the WS client, get the user WS host and login
        if (this.config.mode !== 'lan') {
          wsClient = new (require('./connection/ws'))(this, authData)
          await wsClient.login()

          // Refresh the WS connection every 60 minutes
          this.wsRefresh = setInterval(async () => {
            try {
              if (this.config.debug) {
                this.log('%s.', this.lang.wsRef)
              }
              await wsClient.login()
            } catch (err) {
              const eText = this.funcs.parseError(err)
              this.log.warn('%s %s.', this.lang.wsRefFail, eText)
            }
          }, 3600000)
        }

        // Clear the storage folder and start again when we have access to http devices
        if (storageClient) {
          try {
            await storage.clear()
          } catch (err) {
            if (this.config.debug) {
              const eText = this.funcs.parseError(err)
              this.log.warn('%s %s.', this.lang.storageClearErr, eText)
            }
          }
        }
      } else {
        // Warn that HTTP and WS are disabled
        this.log.warn('%s %s.', this.lang.httpDisabled, this.lang.missingCreds)

        // Get the persist device data if we are in lan only mode
        if (this.config.mode === 'lan' && storageClient) {
          try {
            this.log('Obtaining device list from storage.')
            const persistDeviceList = await storage.values()
            persistDeviceList.forEach(device => deviceList.push(device))
          } catch (err) {
            if (this.config.debug) {
              const eText = this.funcs.parseError(err)
              this.log.warn('%s %s.', this.lang.storageReadErr, eText)
            }
          }
        }
      }

      // Set up the LAN client, scan for device and start monitoring
      if (this.config.mode !== 'wan') {
        lanClient = new (require('./connection/lan'))(this)
        lanDevices = await lanClient.getHosts()
        await lanClient.startMonitor()
      }

      // Initialise each device into HB
      deviceList.forEach(device => this.initialiseDevice(device))
      groupList.forEach(async group => {
        // Create the format of a device
        group.extra = { uiid: 5000 }
        group.deviceid = group.id
        group.productModel = 'Group [' + group.uiid + ']'
        group.online = true
        this.initialiseDevice(group)
      })

      // Check for redundant accessories (in HB but not eWeLink)
      devicesInHB.forEach(async accessory => {
        if (
          !deviceList.some(el => el.deviceid === accessory.context.eweDeviceId) &&
          !groupList.some(el => el.id === accessory.context.eweDeviceId)
        ) {
          this.removeAccessory(accessory)
        }
      })

      // Setup the LAN listener for device notifications
      if (lanClient) {
        lanClient.receiveUpdate(device => this.receiveDeviceUpdate(device))
      }

      // Setup the WS listener for device notifications
      if (wsClient) {
        wsClient.receiveUpdate(device => this.receiveDeviceUpdate(device))
      }

      // Set up the listener server for the API if the user has this enabled
      if (this.config.apiPort !== 0 && this.config.password) {
        apiClient = new (require('./connection/api'))(this, devicesInHB)
        apiServer = http.createServer(async (req, res) => {
          // The 'homepage' shows an html document with info about the API
          if (req.url === '/') {
            res.writeHead(200, { 'Content-Type': 'text/html' })
            res.end(apiClient.showHome())
            return
          }

          // Request is not for the homepage so action appropriately
          res.writeHead(200, { 'Content-Type': 'application/json' })
          try {
            const response = await apiClient.action(req)

            // Actioning the request was successful so respond with a success
            res.end(JSON.stringify({ success: true, response }))
          } catch (err) {
            // An error occurred actioning the request so respond with the error
            res.end(JSON.stringify({ success: false, error: err.message + '.' }))
          }
        })

        // Start listening on the above created server
        apiServer.listen(this.config.apiPort === 1 ? 0 : this.config.apiPort, err => {
          if (err) {
            this.log.warn('%s [%s].', this.lang.apiListenErr, err)
          } else {
            this.log('%s [%s].', this.lang.apiListening, apiServer.address().port)
          }
        })
      }

      // Log that the plugin setup has been successful with a welcome message
      const randIndex = Math.floor(Math.random() * this.lang.zWelcome.length)

      // Set a small timeout so the message should appear after the API port log entry
      setTimeout(() => {
        this.log('%s. %s', this.lang.complete, this.lang.zWelcome[randIndex])
      }, 2000)
    } catch (err) {
      // Catch any errors during setup
      const eText = this.funcs.parseError(err, [
        this.lang.disabled,
        this.lang.missingCreds,
        'password error! [10001]',
        'user does not exists [10003]'
      ])
      this.log.warn('***** %s. *****', this.lang.disabling)
      this.log.warn('***** %s. *****', eText)
      this.pluginShutdown()
    }
  }

  pluginShutdown () {
    // A function that is called when the plugin fails to load or Homebridge restarts
    try {
      // Shutdown the listener server if it's running
      if (apiServer) {
        apiServer.close(() => {
          if (this.config.debug) {
            this.log('%s.', this.lang.apiShutdown)
          }
        })
      }

      // Stop the LAN monitoring
      if (lanClient) {
        lanClient.closeConnection()
      }

      // Close the WS connection
      if (wsClient) {
        clearInterval(this.wsRefresh)
        wsClient.closeConnection()
      }
    } catch (err) {
      // No need to show errors at this point
    }
  }

  async initialiseDevice (device) {
    try {
      let accessory
      const uiid = device.extra && device.extra.uiid ? device.extra.uiid : 0
      const uuid = this.api.hap.uuid.generate(device.deviceid + 'SWX')
      device.showAs =
        this.deviceConf[device.deviceid] && this.deviceConf[device.deviceid].showAs
          ? this.deviceConf[device.deviceid].showAs
          : 'default'

      // Remove old sub accessories for Accessory Simulations and DUALR3 in motor/meter mode
      if (
        device.showAs !== 'default' ||
        (uiid === 126 && [2, 3].includes(device.params.workMode))
      ) {
        for (let i = 0; i <= 4; i++) {
          const uuidsub = this.api.hap.uuid.generate(device.deviceid + 'SW' + i)
          if (devicesInHB.has(uuidsub)) {
            this.removeAccessory(devicesInHB.get(uuidsub))
          }
        }
      }

      // Set up the correct instance for this particular device
      if (uiid === 126 && device.params.workMode === 2) {
        /*************************
        BLINDS [DUALR3 MOTOR MODE]
        *************************/
        // Check the device has been calibrated
        if (device.params.calibState === 0) {
          if (devicesInHB.has(uuid)) {
            this.removeAccessory(devicesInHB.get(uuid))
          }
          this.log.warn('[%s] %s.', device.name, this.lang.dualr3NoCalib)
          this.ignoredDevices.push(device.deviceid)
          return
        }
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/motor'))(this, accessory)
        /************************/
      } else if (uiid === 126 && device.params.workMode === 3) {
        /*************************
        BLINDS [DUALR3 METER MODE]
        *************************/
        if (devicesInHB.has(uuid)) {
          this.removeAccessory(devicesInHB.get(uuid))
        }
        this.log.warn('[%s] %s.', device.name, this.lang.dualr3NoMeter)
        this.ignoredDevices.push(device.deviceid)
        return
      } else if (this.consts.devices.curtain.includes(uiid)) {
        /****************************
        BLINDS [EWELINK UIID 11 & 67]
        ****************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/curtain'))(this, accessory)
        /***************************/
      } else if (device.showAs === 'blind') {
        /****************************
        BLINDS [ACCESSORY SIMULATION]
        ****************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/blind'))(this, accessory)
        /***************************/
      } else if (device.showAs === 'door') {
        /***************************
        DOORS [ACCESSORY SIMULATION]
        ***************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/door'))(this, accessory)
        /**************************/
      } else if (device.showAs === 'window') {
        /*****************************
        WINDOWS [ACCESSORY SIMULATION]
        *****************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/window'))(this, accessory)
        /****************************/
      } else if (this.obstructSwitches[device.deviceid]) {
        /*****************************
        OBSTRUCTION DETECTION SWITCHES
        *****************************/
        const instance = './device/simulation/garage-od-switch'
        accessory = this.addAccessory(device, device.deviceid + 'SWX', true)
        accessory.control = new (require(instance))(this, accessory, devicesInHB)
        /****************************/
      } else if (
        Object.values(this.deviceConf).some(el => el.sensorId === device.deviceid) &&
        (this.consts.devices.garageSensors.includes(uiid) || device.showAs === 'sensor')
      ) {
        /*****************************************
        SENSORS [AS GARAGE/LOCK SENSOR SIMULATION]
        *****************************************/
        const sim = Object.entries(this.deviceConf).find(
          ([id, el]) => el.sensorId === device.deviceid && ['garage', 'lock'].includes(el.showAs)
        )
        const uuidSub = this.api.hap.uuid.generate(sim[0] + 'SWX')
        if (devicesInHB.has(uuidSub)) {
          const subAccessory = devicesInHB.get(uuidSub)
          let instance
          if (sim[1].hideSensor) {
            // If the sensor exists in Homebridge then remove it as needs to be re-added as hidden
            if (devicesInHB.has(uuid)) {
              this.removeAccessory(devicesInHB.get(uuid))
            }
            instance = './device/simulation/sensor-hidden'
            accessory = this.addAccessory(device, device.deviceid + 'SWX', true)
          } else {
            instance = './device/simulation/sensor-visible'
            accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
          }
          accessory.control = new (require(instance))(this, accessory, subAccessory)
        } else {
          accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
          this.log.warn('[%s] %s.', accessory.displayName, this.lang.sensorNoDevice)
          accessory.control = new (require('./device/sensor-contact'))(this, accessory)
        }
        /***********************************************/
      } else if (device.showAs === 'garage') {
        /****************************************
        GARAGE DOORS [ONE] [ACCESSORY SIMULATION]
        ****************************************/
        const instance = './device/simulation/garage-one'
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require(instance))(this, accessory, devicesInHB)
        /***************************************/
      } else if (device.showAs === 'garage_two') {
        /****************************************
        GARAGE DOORS [TWO] [ACCESSORY SIMULATION]
        ****************************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/garage-two'))(this, accessory)
        /***************************************/
      } else if (device.showAs === 'garage_four') {
        /*****************************************
        GARAGE DOORS [FOUR] [ACCESSORY SIMULATION]
        *****************************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/garage-four'))(this, accessory)
        /****************************************/
      } else if (device.showAs === 'garage_eachen') {
        /***************************
        GARAGE DOORS [EACHEN GD-DC5]
        ***************************/
        const instance =
          this.deviceConf[device.deviceid] &&
          this.deviceConf[device.deviceid].showAsEachen === 'lock'
            ? 'lock-eachen'
            : 'garage-eachen'
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/' + instance))(this, accessory)
        /**************************/
      } else if (device.showAs === 'gate') {
        /********************************************
        GATES (AS GARAGE DOOR) [ACCESSORY SIMULATION]
        ********************************************/
        const instance = './device/simulation/gate-one'
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require(instance))(this, accessory, devicesInHB)
        /*******************************************/
      } else if (device.showAs === 'lock') {
        /***************************
        LOCKS [ACCESSORY SIMULATION]
        ***************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/lock-one'))(this, accessory)
        /**************************/
      } else if (device.showAs === 'switch_valve') {
        /**********************************
        SWITCH-VALVE [ACCESSORY SIMULATION]
        **********************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/switch-valve'))(this, accessory)
        /*********************************/
      } else if (device.showAs === 'tap') {
        /********************************
        TAPS [ONE] [ACCESSORY SIMULATION]
        ********************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/tap-one'))(this, accessory)
        /*******************************/
      } else if (device.showAs === 'tap_two') {
        /********************************
        TAPS [TWO] [ACCESSORY SIMULATION]
        ********************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/tap-two'))(this, accessory)
        /*******************************/
      } else if (device.showAs === 'valve') {
        /**********************************
        VALVES [ONE] [ACCESSORY SIMULATION]
        **********************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/valve-one'))(this, accessory)
        /*********************************/
      } else if (device.showAs === 'valve_two') {
        /**********************************
        VALVES [TWO] [ACCESSORY SIMULATION]
        **********************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/valve-two'))(this, accessory)
        /*********************************/
      } else if (device.showAs === 'valve_four') {
        /***********************************
        VALVES [FOUR] [ACCESSORY SIMULATION]
        ***********************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/valve-four'))(this, accessory)
        /**********************************/
      } else if (device.showAs === 'sensor') {
        /*******************
        SENSORS [SIMULATION]
        *******************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/sensor'))(this, accessory)
        /******************/
      } else if (device.showAs === 'p_button') {
        /*******************************
        PROGRAMMABLE BUTTON [SIMULATION]
        *******************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/p-button'))(this, accessory)
        /******************************/
      } else if (device.showAs === 'doorbell') {
        /********************
        DOORBELL [SIMULATION]
        ********************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/doorbell'))(this, accessory)
        /*******************/
      } else if (device.showAs === 'purifier') {
        /*********************
        PURIFIERS [SIMULATION]
        *********************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/purifier'))(this, accessory)
        /********************/
      } else if (device.showAs === 'audio') {
        /***************************
        AUDIO RECEIVERS [SIMULATION]
        ***************************/
        if (devicesInHB.has(uuid)) {
          this.removeAccessory(devicesInHB.get(uuid))
        }
        accessory = this.addExternalAccessory(device, device.deviceid + 'SWX', 34)
        accessory.control = new (require('./device/simulation/tv'))(this, accessory)
        /**************************/
      } else if (device.showAs === 'box') {
        /***********************
        SET TOP BOX [SIMULATION]
        ***********************/
        if (devicesInHB.has(uuid)) {
          this.removeAccessory(devicesInHB.get(uuid))
        }
        accessory = this.addExternalAccessory(device, device.deviceid + 'SWX', 35)
        accessory.control = new (require('./device/simulation/tv'))(this, accessory)
        /**********************/
      } else if (device.showAs === 'stick') {
        /***************************
        STREAMING STICK [SIMULATION]
        ***************************/
        if (devicesInHB.has(uuid)) {
          this.removeAccessory(devicesInHB.get(uuid))
        }
        accessory = this.addExternalAccessory(device, device.deviceid + 'SWX', 36)
        accessory.control = new (require('./device/simulation/tv'))(this, accessory)
        /**************************/
      } else if (
        device.showAs === 'sensor_leak' &&
        this.consts.devices.sensorContact.includes(uiid)
      ) {
        /**************************************
        SENSORS [LEAK DW2 ACCESSORY SIMULATION]
        **************************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/simulation/sensor-leak'))(this, accessory)
        /*************************************/
      } else if (this.consts.devices.sensorContact.includes(uiid)) {
        /*******************
        SENSORS [SONOFF DW2]
        *******************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/sensor-contact'))(this, accessory)
      } else if (this.consts.devices.fan.includes(uiid)) {
        /***
        FANS
        ***/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/fan'))(this, accessory)
        /**/
      } else if (this.consts.devices.diffuser.includes(uiid)) {
        /********
        DIFFUSERS
        ********/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/diffuser'))(this, accessory)
        /*******/
      } else if (this.consts.devices.humidifier.includes(uiid)) {
        /**********
        HUMIDIFIERS
        **********/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/humidifier'))(this, accessory)
        /*********/
      } else if (this.consts.devices.thermostat.includes(uiid)) {
        /**********
        THERMOSTATS
        **********/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/thermostat'))(this, accessory)
        /*******/
      } else if (
        device.showAs === 'thermostat' &&
        this.consts.devices.sensorAmbient.includes(uiid)
      ) {
        /*****************************************
        THERMOSTATS [TH10/16 ACCESSORY SIMULATION]
        *****************************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.context.sensorType = device.params.sensorType
        accessory.control = new (require('./device/simulation/thermostat'))(this, accessory)
        /****************************************/
      } else if (device.showAs === 'heater' && this.consts.devices.sensorAmbient.includes(uiid)) {
        /*************************************
        HEATERS [TH10/16 ACCESSORY SIMULATION]
        *************************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.context.sensorType = device.params.sensorType
        accessory.control = new (require('./device/simulation/heater'))(this, accessory)
        /************************************/
      } else if (device.showAs === 'cooler' && this.consts.devices.sensorAmbient.includes(uiid)) {
        /*************************************
        COOLERS [TH10/16 ACCESSORY SIMULATION]
        *************************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.context.sensorType = device.params.sensorType
        accessory.control = new (require('./device/simulation/cooler'))(this, accessory)
        /************************************/
      } else if (
        device.showAs === 'humidifier' &&
        this.consts.devices.sensorAmbient.includes(uiid)
      ) {
        /*****************************************
        HUMIDIFIERS [TH10/16 ACCESSORY SIMULATION]
        *****************************************/
        if (device.params.sensorType === 'DS18B20') {
          if (devicesInHB.has(uuid)) {
            this.removeAccessory(devicesInHB.get(uuid))
          }
          this.log.warn('[%s] %s.', device.name, this.lang.sensorErr)
          return
        }
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.context.sensorType = device.params.sensorType
        accessory.control = new (require('./device/simulation/humidifier'))(this, accessory)
        /*****************************************/
      } else if (
        device.showAs === 'dehumidifier' &&
        this.consts.devices.sensorAmbient.includes(uiid)
      ) {
        /*******************************************
        DEHUMIDIFIERS [TH10/16 ACCESSORY SIMULATION]
        *******************************************/
        if (device.params.sensorType === 'DS18B20') {
          this.log.warn('[%s] %s.', device.name, this.lang.sensorErr)
          return
        }
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.context.sensorType = device.params.sensorType
        accessory.control = new (require('./device/simulation/dehumidifier'))(this, accessory)
        /*******************************************/
      } else if (this.consts.devices.sensorAmbient.includes(uiid)) {
        /***********************
        SENSOR [AMBIENT-TH10/16]
        ***********************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.context.sensorType = device.params.sensorType
        accessory.control = new (require('./device/sensor-ambient'))(this, accessory)
        /**********************/
      } else if (this.consts.devices.sensorTempHumi.includes(uiid)) {
        /*************************
        SENSOR [AMBIENT-SONOFF SC]
        *************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/sensor-temp-humi'))(this, accessory)
        /************************/
      } else if (this.consts.devices.lightRGB.includes(uiid)) {
        /***********
        LIGHTS [RGB]
        ***********/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/light-rgb'))(this, accessory)
        /**********/
      } else if (this.consts.devices.lightCCT.includes(uiid)) {
        /***********
        LIGHTS [CCT]
        ***********/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/light-cct'))(this, accessory)
        /**********/
      } else if (this.consts.devices.lightRGBCCT.includes(uiid)) {
        /*****************
        LIGHTS [RGB & CCT]
        *****************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/light-rgb-cct'))(this, accessory)
        /****************/
      } else if (this.consts.devices.lightDimmer.includes(uiid)) {
        /**************
        LIGHTS [DIMMER]
        **************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/light-dimmer'))(this, accessory)
        /*************/
        /**********************/
      } else if (
        this.consts.devices.switchSingle.includes(uiid) ||
        this.consts.devices.switchSinglePower.includes(uiid) ||
        this.consts.devices.switchSCM.includes(uiid)
      ) {
        /********************************
        SWITCHES/OUTLETS [SINGLE CHANNEL]
        ********************************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control =
          device.showAs === 'outlet'
            ? this.deviceConf[device.deviceid] && this.deviceConf[device.deviceid].isInched
              ? new (require('./device/outlet-single-inched'))(this, accessory)
              : new (require('./device/outlet-single'))(this, accessory)
            : this.deviceConf[device.deviceid] && this.deviceConf[device.deviceid].isInched
            ? new (require('./device/switch-single-inched'))(this, accessory)
            : new (require('./device/switch-single'))(this, accessory)
        /*******************************/
      } else if (
        this.consts.devices.switchMulti.includes(uiid) ||
        this.consts.devices.switchMultiPower.includes(uiid)
      ) {
        /*******************************
        SWITCHES/OUTLETS [MULTI CHANNEL]
        *******************************/

        // If a single accessory is leftover from a simulation then remove it
        if (devicesInHB.has(uuid)) {
          this.removeAccessory(devicesInHB.get(uuid))
        }

        // Loop through the channels of the device
        for (let i = 0; i <= this.consts.supportedDevices[uiid]; i++) {
          let subAccessory
          const uuidsub = this.api.hap.uuid.generate(device.deviceid + 'SW' + i)

          // Check if the user has chosen to hide any channels for this device
          if (
            this.hideChannels.includes(device.deviceid + 'SW' + i) ||
            (i === 0 &&
              this.deviceConf[device.deviceid] &&
              this.deviceConf[device.deviceid].inchChannels)
          ) {
            // The user has hidden this channel so if it exists then remove it
            if (devicesInHB.has(uuidsub)) {
              this.removeAccessory(devicesInHB.get(uuidsub))
            }

            // If this is the main channel then add it to the array of hidden masters
            if (i === 0) {
              this.hideMasters.push(device.deviceid)
            }

            // Add the sub accessory, but hidden, to Homebridge
            subAccessory = this.addAccessory(device, device.deviceid + 'SW' + i, true)
          } else {
            // The user has not hidden this channel
            subAccessory =
              devicesInHB.get(uuidsub) || this.addAccessory(device, device.deviceid + 'SW' + i)
          }

          // Add context information to the sub accessory
          subAccessory.context.firmware = device.params.fwVersion || plugin.version
          subAccessory.context.reachableWAN = wsClient && device.online
          subAccessory.context.reachableLAN =
            lanClient && lanDevices.has(device.deviceid) && lanDevices.get(device.deviceid).ip
          subAccessory.context.eweBrandName = device.brandName
          subAccessory.context.eweBrandLogo = device.brandLogo
          subAccessory.context.eweShared =
            device.sharedBy && device.sharedBy.email ? device.sharedBy.email : false
          subAccessory.context.ip =
            lanClient && subAccessory.context.reachableLAN
              ? lanDevices.get(device.deviceid).ip
              : false
          subAccessory.context.macAddress =
            device.extra && device.extra.staMac
              ? device.extra.staMac.replace(/[:]+/g, '').replace(/..\B/g, '$&:')
              : false
          subAccessory.context.lanKey = device.devicekey
          subAccessory.control =
            device.showAs === 'outlet'
              ? new (require('./device/outlet-multi'))(this, subAccessory, devicesInHB)
              : new (require('./device/switch-multi'))(this, subAccessory, devicesInHB)

          // Mark the online/offline status of certain devices
          if (wsClient && subAccessory.control && subAccessory.control.markStatus) {
            subAccessory.control.markStatus(device.online)
          }

          // Update any changes to the sub accessory to the platform
          this.api.updatePlatformAccessories(plugin.name, plugin.alias, [subAccessory])
          devicesInHB.set(subAccessory.UUID, subAccessory)
          if (i === 0) {
            accessory = subAccessory
          }
        }
        /******************************/
      } else if (this.consts.devices.rfBridge.includes(uiid)) {
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
        accessory = this.addAccessory(device, device.deviceid + 'SW0', true, { rfMap }, 'rf_pri')
        const instance = './device/rf-bridge'
        accessory.control = new (require(instance))(this, accessory, devicesInHB)

        // We don't want to add the main bridge as a visible accessory in Homebridge
        this.hideMasters.push(device.deviceid)

        // Flag used for later to remove and re-add the subdevices if user configured
        const resetRF =
          this.deviceConf[device.deviceid] && this.deviceConf[device.deviceid].resetOnStartup

        // Loop through each sub device connected to the RF Bridge
        rfMap.forEach(subDevice => {
          const swNumber = rfChlCounter + 1
          let subAccessory
          let subType
          const fullDeviceId = device.deviceid + 'SW' + swNumber
          const uuidsub = this.api.hap.uuid.generate(fullDeviceId)
          const deviceConf = this.rfSubdevices[fullDeviceId] || {}

          // Check which eWeLink type the connected sub device is
          let instance
          switch (subDevice.type) {
            case '1':
            case '2':
            case '3':
            case '4':
              subType = 'button'
              instance = 'rf-button'
              break
            case '5':
              switch (deviceConf.curtainType) {
                case 'blind':
                case 'door':
                case 'window':
                  subType = deviceConf.curtainType
                  instance = 'simulation/rf-' + deviceConf.curtainType
                  break
                default:
                  subType = 'curtain'
                  instance = 'rf-button'
                  break
              }
              break
            case '6':
            case '7':
              subType = 'sensor'
              instance = 'rf-sensor'
              break
            default: {
              this.log.warn(
                '[%s] %s:\n[%s-%s] %s.',
                device.name,
                this.lang.devNotSupYet,
                uiid,
                subDevice.type || '?',
                JSON.stringify(device.params)
              )
              return
            }
          }

          // Create an object to save to the sub accessory context
          const subExtraContext = {
            buttons: subDevice.buttons,
            subType,
            swNumber,
            name: subDevice.name
          }

          // Check if we need to reset the RF devices
          if (resetRF && (subAccessory = devicesInHB.get(uuidsub))) {
            this.removeAccessory(subAccessory)
          }

          // Get the sub accessory if it's new or hasn't been removed above
          subAccessory =
            devicesInHB.get(uuidsub) ||
            this.addAccessory(device, fullDeviceId, false, subExtraContext, 'rf_sub')

          // Add context information to the sub accessory
          subAccessory.context.firmware = device.params.fwVersion || plugin.version
          subAccessory.context.reachableWAN = wsClient && device.online
          subAccessory.context.reachableLAN =
            lanClient && lanDevices.has(device.deviceid) && lanDevices.get(device.deviceid).ip
          subAccessory.context.eweBrandName = device.brandName
          subAccessory.context.eweBrandLogo = device.brandLogo
          subAccessory.context.eweShared =
            device.sharedBy && device.sharedBy.email ? device.sharedBy.email : false
          subAccessory.context.ip =
            lanClient && subAccessory.context.reachableLAN
              ? lanDevices.get(device.deviceid).ip
              : false
          subAccessory.context.macAddress =
            device.extra && device.extra.staMac
              ? device.extra.staMac.replace(/[:]+/g, '').replace(/..\B/g, '$&:')
              : false
          subAccessory.context.lanKey = device.devicekey

          subAccessory.context.subType = subType

          // Get the instance for this RF device
          subAccessory.control = new (require('./device/' + instance))(this, subAccessory)

          // Mark the online/offline status of certain devices
          if (wsClient && subAccessory.control && subAccessory.control.markStatus) {
            subAccessory.control.markStatus(device.online)
          }

          // Update any changes to the sub accessory to the platform
          this.api.updatePlatformAccessories(plugin.name, plugin.alias, [subAccessory])
          devicesInHB.set(subAccessory.UUID, subAccessory)

          // Increment the counter
          rfChlCounter += Object.keys(subDevice.buttons || {}).length
        })

        // Update any changes to the accessory to the platform
        accessory.context.channelCount = rfChlCounter
        /********************/
      } else if (this.consts.devices.zbBridge.includes(uiid)) {
        /************
        ZIGBEE BRIDGE
        ************/
        this.ignoredDevices.push(device.deviceid)
        return
        /***********/
      } else if (this.consts.devices.zbSwitchStateless.includes(uiid)) {
        /**********************
        ZIGBEE STATELESS SWITCH
        **********************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/zigbee/switch-stateless'))(this, accessory)
        /*********************/
      } else if (this.consts.devices.zbLightDimmer.includes(uiid)) {
        /*****************
        ZB LIGHTS [DIMMER]
        *****************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/zigbee/light-dimmer'))(this, accessory)
        /****************/
      } else if (this.consts.devices.zbLightCCT.includes(uiid)) {
        /**************
        ZB LIGHTS [CCT]
        **************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/zigbee/light-cct'))(this, accessory)
        /*************/
      } else if (this.consts.devices.zbSensorAmbient.includes(uiid)) {
        /******************
        ZB SENSOR [AMBIENT]
        ******************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/zigbee/sensor-ambient'))(this, accessory)
        /*****************/
      } else if (this.consts.devices.zbSensorMotion.includes(uiid)) {
        /*****************
        ZB SENSOR [MOTION]
        *****************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/zigbee/sensor-motion'))(this, accessory)
        /****************/
      } else if (this.consts.devices.zbSensorContact.includes(uiid)) {
        /******************
        ZB SENSOR [CONTACT]
        ******************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/zigbee/sensor-contact'))(this, accessory)
        /*****************/
      } else if (this.consts.devices.zbSensorWater.includes(uiid)) {
        /***************
        ZB SENSOR [LEAK]
        ***************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.control = new (require('./device/zigbee/sensor-leak'))(this, accessory)
        /**************/
      } else if (this.consts.devices.group.includes(uiid)) {
        /*************
        EWELINK GROUPS
        *************/
        accessory = devicesInHB.get(uuid) || this.addAccessory(device, device.deviceid + 'SWX')
        accessory.context.groupUIID = device.uiid
        accessory.control = new (require('./device/group'))(this, accessory)
        /************/
      } else if (this.consts.devices.camera.includes(uiid)) {
        /*************
        SONOFF CAMERAS
        *************/
        this.log('[%s] %s.', device.name, this.lang.sonoffCamera)
        this.ignoredDevices.push(device.deviceid)
        return
        /************/
      } else if (this.consts.devices.cannotSupport.includes(uiid)) {
        /*******************************
        DEVICES THAT CANNOT BE SUPPORTED
        *******************************/
        this.log('[%s] %s.', device.name, this.lang.devNotSup)
        this.ignoredDevices.push(device.deviceid)
        return
        /******************************/
      } else {
        /**********************
        DEVICES PENDING SUPPORT
        **********************/
        this.log.warn(
          '[%s] %s:\n[%s] %s.',
          device.name,
          this.lang.devNotSupYet,
          uiid,
          JSON.stringify(device.params)
        )
        return
        /*********************/
      }

      // Update the reachability values (via WS and LAN)
      accessory.context.firmware = device.params.fwVersion || plugin.version
      accessory.context.reachableWAN = wsClient && device.online
      accessory.context.reachableLAN =
        lanClient && lanDevices.has(device.deviceid) && lanDevices.get(device.deviceid).ip
      accessory.context.eweBrandName = device.brandName
      accessory.context.eweBrandLogo = device.brandLogo
      accessory.context.eweShared =
        device.sharedBy && device.sharedBy.email ? device.sharedBy.email : false
      accessory.context.ip =
        lanClient && accessory.context.reachableLAN ? lanDevices.get(device.deviceid).ip : false
      accessory.context.macAddress =
        device.extra && device.extra.staMac
          ? device.extra.staMac.replace(/[:]+/g, '').replace(/..\B/g, '$&:')
          : false
      accessory.context.lanKey = device.devicekey

      // Add the uuid and lanKey to the lanClient map
      if (lanClient) {
        lanClient.addDeviceDetailsToMap(device.deviceid, accessory.context)
      }

      // Helpful logging for each device
      const str = accessory.context.reachableLAN
        ? this.lang.foundWithIP + ' [' + lanDevices.get(device.deviceid).ip + ']'
        : this.lang.lanUnsupported

      // Check to see if the discovered IP is different from any manually configured IP
      if (
        accessory.context.reachableLAN &&
        this.ipOverride[device.deviceid] &&
        this.ipOverride[device.deviceid] !== lanDevices.get(device.deviceid).ip
      ) {
        this.log.warn(
          '[%s] %s [%s].',
          accessory.displayName,
          this.lang.lanIPDifferent,
          lanDevices.get(device.deviceid).ip
        )
      }

      // Check to see if it's a shared device being used with the cloud
      if (!accessory.context.reachableLAN && accessory.context.eweShared) {
        this.log.warn('[%s] %s.', accessory.displayName, this.lang.shareWarn)
      }

      // Check to see if the device has initially been reported offline
      if (wsClient && !accessory.context.reachableWAN && !accessory.context.reachableLAN) {
        this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.repOffline, this.lang.viaWS)
      }

      // Update accessory characteristics with latest values
      if (wsClient && accessory.control && accessory.control.externalUpdate) {
        accessory.control.externalUpdate(device.params)

        // Mark the online/offline status of certain devices
        if (accessory.control.markStatus) {
          accessory.control.markStatus(device.online)
        }
      }

      // Update any changes to the device into our devicesInHB map
      this.api.updatePlatformAccessories(plugin.name, plugin.alias, [accessory])
      devicesInHB.set(accessory.UUID, accessory)
      if (uiid === 5000) {
        this.log(
          '[%s] %s [%s] [%s].',
          accessory.displayName,
          this.lang.devInitGroup,
          device.deviceid,
          uiid
        )
      } else {
        this.log(
          '[%s] %s %s [%s:%s].',
          accessory.displayName,
          this.lang.devInit,
          str,
          uiid,
          device.productModel
        )
      }

      // Store the device in the persist file
      if (storageClient && this.consts.devices.lan.includes(uiid)) {
        try {
          await storage.setItem(device.deviceid, device)
        } catch (err) {
          if (this.config.debug) {
            const eText = this.funcs.parseError(err)
            this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.storageWriteErr, eText)
          }
        }
      }
    } catch (err) {
      // Catch any errors during initialisation
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', device.name, this.lang.devNotInit, eText)
    }
  }

  addAccessory (device, hbDeviceId, hidden = false, extraContext = {}, type = '') {
    // Add an accessory to Homebridge
    let newDeviceName
    try {
      // Get the switchNumber which can be {X, 0, 1, 2, 3, 4, ...}
      const switchNumber = hbDeviceId.split('SW')[1].toString()
      const channelCount =
        type === 'rf_pri'
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
        accessory
          .getService(this.api.hap.Service.AccessoryInformation)
          .setCharacteristic(this.api.hap.Characteristic.Name, newDeviceName)
          .setCharacteristic(this.api.hap.Characteristic.ConfiguredName, newDeviceName)
          .setCharacteristic(this.api.hap.Characteristic.SerialNumber, hbDeviceId)
          .setCharacteristic(this.api.hap.Characteristic.Manufacturer, device.brandName)
          .setCharacteristic(
            this.api.hap.Characteristic.Model,
            device.productModel + ' (' + device.extra.model + ')'
          )
          .setCharacteristic(
            this.api.hap.Characteristic.FirmwareRevision,
            device.params.fwVersion || plugin.version
          )
          .setCharacteristic(this.api.hap.Characteristic.Identify, true)
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
          channelCount,
          hidden
        },
        ...extraContext
      }

      // Register the accessory if it hasn't been hidden by the user
      if (!hidden) {
        this.api.registerPlatformAccessories(plugin.name, plugin.alias, [accessory])
        this.log('[%s] %s.', newDeviceName, this.lang.devAdd)
      }

      // Return the new accessory
      this.configureAccessory(accessory)
      return accessory
    } catch (err) {
      // Catch any errors during add
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', newDeviceName, this.lang.devNotAdd, eText)
      return false
    }
  }

  addExternalAccessory (device, hbDeviceId, category) {
    try {
      // Add the new accessory to Homebridge
      const accessory = new this.api.platformAccessory(
        device.name,
        this.api.hap.uuid.generate(hbDeviceId),
        category
      )

      // Set the accessory characteristics
      accessory
        .getService(this.api.hap.Service.AccessoryInformation)
        .setCharacteristic(this.api.hap.Characteristic.Name, device.name)
        .setCharacteristic(this.api.hap.Characteristic.ConfiguredName, device.name)
        .setCharacteristic(this.api.hap.Characteristic.SerialNumber, hbDeviceId)
        .setCharacteristic(this.api.hap.Characteristic.Manufacturer, device.brandName)
        .setCharacteristic(
          this.api.hap.Characteristic.Model,
          device.productModel + ' (' + device.extra.model + ')'
        )
        .setCharacteristic(
          this.api.hap.Characteristic.FirmwareRevision,
          device.params.fwVersion || plugin.version
        )
        .setCharacteristic(this.api.hap.Characteristic.Identify, true)

      // Add helpful context values to the accessory
      accessory.context = {
        ...{
          hbDeviceId,
          eweDeviceId: device.deviceid,
          eweUIID: device.extra.uiid,
          eweModel: device.productModel,
          eweApiKey: device.apikey,
          switchNumber: hbDeviceId.split('SW')[1].toString(),
          channelCount: this.consts.supportedDevices[device.extra.uiid],
          hidden: false
        }
      }

      // Register the accessory
      this.api.publishExternalAccessories(plugin.name, [accessory])
      this.log('[%s] %s.', device.name, this.lang.devAdd)

      // Return the new accessory
      this.configureAccessory(accessory)
      return accessory
    } catch (err) {
      // Catch any errors during add
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', device.name, this.lang.devNotAdd, eText)
      return false
    }
  }

  configureAccessory (accessory) {
    // Set the correct firmware version if we can
    if (this.api && accessory.context.firmware) {
      accessory
        .getService(this.api.hap.Service.AccessoryInformation)
        .updateCharacteristic(
          this.api.hap.Characteristic.FirmwareRevision,
          accessory.context.firmware
        )
    }

    // Add the configured accessory to our global map
    devicesInHB.set(accessory.UUID, accessory)
  }

  removeAccessory (accessory) {
    try {
      // Remove an accessory from Homebridge
      if (!accessory.context.hidden) {
        this.api.unregisterPlatformAccessories(plugin.name, plugin.alias, [accessory])
      }
      devicesInHB.delete(accessory.UUID)
      this.log('[%s] %s.', accessory.displayName, this.lang.devRemove)
    } catch (err) {
      // Catch any errors during remove
      const eText = this.funcs.parseError(err)
      this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.devNotRemove, eText)
    }
  }

  async sendDeviceUpdate (accessory, params) {
    // Add to a queue so multiple updates are at least 500ms apart
    return await queue.add(async () => {
      // Log the update being sent
      if (accessory.control.enableDebugLogging) {
        this.log('[%s] %s %s.', accessory.displayName, this.lang.updSend, JSON.stringify(params))
      }

      // Set up the payload to send via LAN/WS
      const payload = {
        apikey: accessory.context.eweApiKey,
        deviceid: accessory.context.eweDeviceId,
        params
      }

      // Check if we can send via LAN otherwise send via WS
      const res = !lanClient
        ? this.lang.lanDisabled
        : !this.consts.devices.lan.includes(accessory.context.eweUIID)
        ? this.lang.lanNotSup
        : await lanClient.sendUpdate(payload)

      // Revert to WS if LAN mode not possible for whatever reason
      if (res !== 'ok') {
        // Check to see if the device is online
        if (wsClient) {
          // Log the revert if appropriate
          if (accessory.control.enableDebugLogging) {
            this.log('[%s] %s %s.', accessory.displayName, this.lang.revertWS, res)
          }

          // Attempt the update
          if (accessory.context.reachableWAN) {
            // Device is online via WS so send the update
            return await wsClient.sendUpdate(payload)
          } else {
            // Device appears to be offline
            throw new Error(this.lang.unreachable)
          }
        } else {
          // Device isn't online via WS so report the error back
          const eText = [this.lang.lanDisabled, this.lang.lanNotSup].includes(res)
            ? res
            : this.lang.unreachable + ' [' + res + ']'
          throw new Error(eText)
        }
      }
    })
  }

  async sendGroupUpdate (accessory, params) {
    // Add to a queue so multiple updates are at least 500ms apart
    return await queue.add(async () => {
      // Log the update being sent
      if (accessory.control.enableDebugLogging) {
        this.log('[%s] %s %s.', accessory.displayName, this.lang.updSend, JSON.stringify(params))
      }

      // Send the request via HTTP
      httpClient.updateGroup(accessory.context.eweDeviceId, params)
    })
  }

  async receiveDeviceUpdate (device) {
    const deviceId = device.deviceid
    let accessory
    let reachableChange = false

    // Find our accessory for which the updates relates to
    const uuid1 = this.api.hap.uuid.generate(deviceId + 'SWX')
    const uuid2 = this.api.hap.uuid.generate(deviceId + 'SW0')
    if ((accessory = devicesInHB.get(uuid1) || devicesInHB.get(uuid2))) {
      if (accessory.control.enableDebugLogging) {
        this.log(
          '[%s] %s %s.',
          accessory.displayName,
          this.lang.updRec,
          JSON.stringify(device.params)
        )
      }
      if (device.params.updateSource === 'WS') {
        // The update is from WS so update the WS online/offline status
        if (device.params.online !== accessory.context.reachableWAN) {
          accessory.context.reachableWAN = device.params.online
          this.api.updatePlatformAccessories(plugin.name, plugin.alias, [accessory])
          devicesInHB.set(accessory.UUID, accessory)

          // Flag this true to update the sub accessories later
          reachableChange = true

          // Log the new reachability of the device
          if (accessory.control.enableLogging) {
            if (accessory.context.reachableWAN) {
              this.log('[%s] %s %s.', accessory.displayName, this.lang.repOnline, this.lang.viaWS)
            } else {
              this.log.warn(
                '[%s] %s %s.',
                accessory.displayName,
                this.lang.repOffline,
                this.lang.viaWS
              )
            }
          }

          // Mark the online/offline status of certain devices
          if (accessory.control.markStatus) {
            accessory.control.markStatus(device.params.online)
          }

          // Try and request an update through WS if the device has come back online
          if (accessory.context.reachableWAN && wsClient) {
            try {
              await wsClient.requestUpdate(accessory)
            } catch (err) {
              // Suppress any errors here
            }
          }
        }
      }
      if (device.params.updateSource === 'LAN') {
        // The update is from LAN so it must be online
        if (!accessory.context.reachableLAN) {
          accessory.context.reachableLAN = true

          // Flag this true to update the sub accessories later
          reachableChange = true

          // Log the new reachability of the device
          if (accessory.control.enableLogging) {
            this.log('[%s] %s %s.', accessory.displayName, this.lang.repOnline, this.lang.viaLAN)
          }

          // Try and request an update through WS if the device has come back online
          if (accessory.context.reachableWAN && wsClient) {
            try {
              await wsClient.requestUpdate(accessory)
            } catch (err) {
              // Suppress any errors here
            }
          }
        }

        // Check to see if the IP of the device has changed
        if (device.params.ip && device.params.ip !== accessory.context.ip) {
          accessory.context.ip = device.params.ip

          // Flag this true to update the sub accessories later
          reachableChange = true

          // Log the new ip of the device
          if (accessory.control.enableLogging) {
            this.log('[%s] %s [%s].', accessory.displayName, this.lang.newIP, device.params.ip)
          }
        }

        // Update the accessory context if the device is back online or the IP changed
        if (reachableChange) {
          this.api.updatePlatformAccessories(plugin.name, plugin.alias, [accessory])
          devicesInHB.set(accessory.UUID, accessory)
        }
      }

      // Update this new online/offline status for all switches of multi channel devices
      if (reachableChange && accessory.context.hbDeviceId.substr(-1) !== 'X') {
        // Loop through to see which channels are in HB
        for (let i = 1; i <= accessory.context.channelCount; i++) {
          const uuid = this.api.hap.uuid.generate(deviceId + 'SW' + i)
          if (devicesInHB.has(uuid)) {
            // Find the sub accessory
            const subAccessory = devicesInHB.get(uuid)

            // Update the WAN status
            subAccessory.context.reachableWAN = device.params.online
            if (
              device.params.updateSource === 'WS' &&
              subAccessory.control &&
              subAccessory.control.markStatus
            ) {
              subAccessory.control.markStatus(device.params.online)
            }

            // Update the LAN status
            if (device.params.updateSource === 'LAN') {
              subAccessory.context.reachableLAN = true
              if (device.params.ip) {
                subAccessory.context.ip = device.params.ip
              }
            }

            // Save the sub accessory updates to the platform
            this.api.updatePlatformAccessories(plugin.name, plugin.alias, [subAccessory])
            devicesInHB.set(subAccessory.UUID, subAccessory)
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
        this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.devNotRf, eText)
      }
    } else {
      // The device does not exist in HB so let's try to add it
      try {
        // Don't continue if the user has hidden this device
        if (this.ignoredDevices.includes(deviceId) || !httpClient) {
          return
        }

        // Log the update if debug is set to true
        if (this.config.debug) {
          this.log('[%s] %s %s.', deviceId, this.lang.recNew, JSON.stringify(device.params))
        }

        // Obtain full device information from the HTTP API
        const newDevice = await httpClient.getDevice(deviceId)

        // Initialise the device in HB
        this.initialiseDevice(newDevice)
      } catch (err) {
        // Automatically adding the new device failed for some reason
        const eText = this.funcs.parseError(err)
        this.log.warn('[%s] %s %s.', deviceId, this.lang.devNewNotAdd, eText)
      }
    }
  }

  async deviceUpdateError (accessory, err, requestRefresh) {
    // Log the error
    const eText = this.funcs.parseError(err)
    this.log.warn('[%s] %s %s.', accessory.displayName, this.lang.devNotUpd, eText)

    // We only request a device refresh on failed internal updates
    if (requestRefresh && accessory.context.reachableWAN && wsClient) {
      try {
        await wsClient.requestUpdate(accessory)
      } catch (err) {
        // Suppress any errors at this point
      }
    }
  }
}

// Export the plugin to Homebridge
module.exports = hb => hb.registerPlatform(plugin.alias, eWeLinkPlatform)
