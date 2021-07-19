/* jshint node: true,esversion: 9, -W014, -W033 */
/* eslint-disable new-cap */
'use strict'

const axios = require('axios')
const crypto = require('crypto')
const dnsSd = require('./../node-dns-sd')
const emitter = new (require('events'))()

module.exports = class connectionLAN {
  constructor (platform) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
    this.funcs = platform.funcs
    this.ipOverride = platform.ipOverride
    this.lang = platform.lang
    this.log = platform.log
    this.mode = platform.config.mode

    // Set up other variables and libraries needed by this class
    this.deviceMap = new Map()
  }

  async getHosts () {
    // Create a template map with our device list from the HTTP client
    for (const [deviceId, ip] of Object.entries(this.ipOverride)) {
      // Add this device into the map with it's user configured IP
      this.deviceMap.set(deviceId, { ip })
    }

    // Perform an initial discovery of devices on the local network
    if (this.debug) {
      this.log('%s.', this.lang.lanStarting)
    }
    const res = await dnsSd.discover({ name: '_ewelink._tcp.local' })
    if (this.debug) {
      this.log('%s.', this.lang.lanStarted)
    }

    // Update the device map for each device found on the local network
    res.forEach(device => {
      // Obtain the ewelink deviceId and check to see it is in our map
      const deviceId = device.fqdn.replace('._ewelink._tcp.local', '').replace('eWeLink_', '')
      this.deviceMap.set(deviceId, { ip: device.address })
    })
    return this.deviceMap
  }

  async startMonitor () {
    // Function to parse DNS packets picked up by node-dns-sd
    dnsSd.ondata = packet => {
      try {
        if (!packet.answers) {
          return
        }
        packet.answers
          .filter(value => value.name.includes('_ewelink._tcp.local'))
          .filter(value => value.type === 'TXT')
          .filter(value => this.deviceMap.has(value.rdata.id))
          .filter(value => this.deviceMap.get(value.rdata.id).lanKey)
          .forEach(value => {
            const rdata = value.rdata

            // Check the packet relates to a device in our map
            const deviceInfo = this.deviceMap.get(rdata.id)

            // Skip the update if it's a duplicate
            if (deviceInfo.lastIV === rdata.iv) {
              return
            }
            deviceInfo.lastIV = rdata.iv

            // Obtain the packet information
            const data =
              rdata.data1 + (rdata.data2 || '') + (rdata.data3 || '') + (rdata.data4 || '')
            const key = crypto
              .createHash('md5')
              .update(Buffer.from(deviceInfo.lanKey, 'utf8'))
              .digest()
            const dText = crypto.createDecipheriv(
              'aes-128-cbc',
              key,
              Buffer.from(rdata.iv, 'base64')
            )
            const pText = Buffer.concat([
              dText.update(Buffer.from(data, 'base64')),
              dText.final()
            ]).toString('utf8')

            // Check to see if the IP address of the device has changed
            if (packet.address !== deviceInfo.ip) {
              deviceInfo.ip = packet.address
            }

            this.deviceMap.set(rdata.id, deviceInfo)

            // Parse the deconstructed information from the packet
            let params
            try {
              params = JSON.parse(pText)
            } catch (err) {
              this.log.warn(
                '[%s] %s %s:\n%s',
                rdata.id,
                this.lang.cantReadPacket,
                err.message,
                pText
              )
              return
            }

            // Remove any params we don't need
            for (const param in params) {
              if (this.funcs.hasProperty(params, param)) {
                if (!this.consts.paramsToKeep.includes(param.replace(/[0-9]/g, ''))) {
                  delete params[param]
                }
              }
            }

            // If any params are left then generate the template to be emitted
            if (Object.keys(params).length > 0) {
              if (packet.address !== deviceInfo.ip) {
                params.ip = packet.address
              }
              params.online = true
              params.updateSource = 'LAN'
              const returnTemplate = {
                deviceid: rdata.id,
                params
              }
              emitter.emit('update', returnTemplate)
            }
          })
      } catch (err) {
        const eText = this.funcs.parseError(err)
        this.log.warn('%s %s.', this.lang.cantParsePacket, eText)
      }
    }

    // Start the DNS packet monitoring
    await dnsSd.startMonitoring()
    this.log('%s.', this.lang.lanMonitor)
  }

  async sendUpdate (json) {
    try {
      // Check this device exists in the map
      if (!this.deviceMap.has(json.deviceid)) {
        throw new Error(this.lang.devNotReachLAN)
      }

      const deviceInfo = this.deviceMap.get(json.deviceid)

      // Check we have an IP address for the device
      if (!deviceInfo.ip) {
        throw new Error(this.lang.devNotReachLAN)
      }

      // Check we have the device lan key
      if (!deviceInfo.lanKey || !deviceInfo.uiid || !deviceInfo.productModel) {
        throw new Error(this.lang.devNoAPIKey)
      }

      const params = {}
      let suffix

      // Check the params to see which suffix and params we need
      if (json.params.brightness) {
        params.switch = 'on'
        params.brightness = json.params.brightness
        params.mode = 0
        suffix = 'dimmable'
      } else if (json.params.switches) {
        if (deviceInfo.uiid === 34 && ['iFan03', 'iFan'].includes(deviceInfo.productModel)) {
          // Special format for some iFan models
          if (json.params.switches[0].outlet === 0) {
            // Turn on/off the light for the iFan
            params.light = json.params.switches[0].switch
            suffix = 'light'
          } else {
            // Change the state or speed of the iFan
            if (json.params.switches[0].switch === 'off') {
              params.fan = 'off'
            } else {
              params.fan = 'on'
              switch (json.params.switches[1].switch + json.params.switches[2].switch) {
                case 'offoff':
                  params.speed = 1
                  break
                case 'onoff':
                  params.speed = 2
                  break
                case 'offon':
                  params.speed = 3
                  break
              }
            }
            suffix = 'fan'
          }
        } else {
          params.switches = json.params.switches
          suffix = 'switches'
        }
      } else if (json.params.switch) {
        params.switch = json.params.switch
        if (deviceInfo.uiid === 15) {
          // TH10/16 only supports LAN in normal mode
          if (json.params.deviceType === 'normal') {
            // Extra params for the TH10/16
            params.mainSwitch = json.params.mainSwitch
            params.deviceType = json.params.deviceType
          } else {
            throw new Error(this.lang.devNotConfLAN)
          }
        }
        suffix = 'switch'
      } else if (this.funcs.hasProperty(json.params, 'location') && deviceInfo.uiid === 126) {
        // Use hasProperty has location can be INT 0
        params.location = json.params.location
        suffix = 'location'
      } else if (json.params.uiActive && deviceInfo.uiid === 32) {
        params.uiActive = json.params.uiActive
        suffix = 'monitor'
      } else if (json.params.cmd) {
        params.cmd = 'transmit'
        params.rfChl = json.params.rfChl
        suffix = 'transmit'
      } else {
        throw new Error(this.lang.devNotConfLAN)
      }

      // Generate the HTTP request
      const key = crypto
        .createHash('md5')
        .update(Buffer.from(deviceInfo.lanKey, 'utf8'))
        .digest()
      const iv = crypto.randomBytes(16)
      const enc = crypto.createCipheriv('aes-128-cbc', key, iv)
      const data = {
        data: Buffer.concat([enc.update(JSON.stringify(params)), enc.final()]).toString('base64'),
        deviceid: json.deviceid,
        encrypt: true,
        iv: iv.toString('base64'),
        selfApikey: '123',
        sequence: Date.now().toString()
      }

      // Send the HTTP request
      const res = await axios({
        method: 'post',
        url: 'http://' + deviceInfo.ip + ':8081/zeroconf/' + suffix,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        data,
        timeout: this.mode === 'lan' ? 9000 : 3000
      })

      // Check for any errors in the response
      if (!res.data || res.data.error !== 0) {
        const error = res.data && res.data.error ? res.data.error : this.lang.lanErr
        throw new Error(error)
      }

      // This ok is needed by the plugin
      return 'ok'
    } catch (err) {
      return this.funcs.parseError(err)
    }
  }

  receiveUpdate (f) {
    emitter.addListener('update', f)
  }

  addDeviceDetailsToMap (deviceId, context) {
    const entry = this.deviceMap.get(deviceId) || { ip: this.ipOverride[deviceId] }
    entry.lanKey = context.lanKey
    entry.uiid = context.eweUIID
    entry.productModel = context.eweModel
    this.deviceMap.set(deviceId, entry)
  }

  async closeConnection () {
    // This is called when Homebridge is shutdown
    await dnsSd.stopMonitoring()
    if (this.debug) {
      this.log('%s.', this.lang.stoppedLAN)
    }
  }
}
