/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class connectionLAN {
  constructor (platform, devices) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.funcs = platform.funcs
    this.log = platform.log
    this.lang = platform.lang
    this.debug = platform.config.debug

    // Set up config variables from the platform
    this.mode = platform.config.mode
    this.ipOverride = platform.ipOverride

    // Set up libraries from the platform
    this.axios = platform.axios
    this.crypto = platform.crypto

    // Set up other variables and libraries needed by this class
    this.deviceMap = new Map()
    this.dns = require('node-dns-sd')
    this.emitter = new (require('events'))()

    // Create a template map with our device list from the HTTP client
    devices.forEach(device => {
      // Don't continue if the device doesn't support LAN mode
      if (!this.consts.devices.lanIn.includes(device.extra.uiid)) {
        return
      }

      // Add this device into the map with it's key and user configured IP
      this.deviceMap.set(device.deviceid, {
        apiKey: device.devicekey,
        ip: this.ipOverride[device.deviceid]
      })
    })
  }

  async getHosts () {
    // Perform an initial discovery of devices on the local network
    if (this.debug) {
      this.log('%s.', this.lang.lanStarting)
    }
    const res = await this.dns.discover({
      name: '_ewelink._tcp.local'
    })
    if (this.debug) {
      this.log('%s.', this.lang.lanStarted)
    }

    // Update the device map for each device found on the local network
    res.forEach(device => {
      // Obtain the ewelink deviceId and check to see it is in our map
      const deviceId = device.fqdn.replace('._ewelink._tcp.local', '')
        .replace('eWeLink_', '')
      let d
      if ((d = this.deviceMap.get(deviceId)) && !d.ip) {
        // Update the map with the found IP address
        this.deviceMap.set(deviceId, {
          apiKey: d.apiKey,
          ip: device.address,
          lastIV: null
        })
      }
    })
    return this.deviceMap
  }

  async startMonitor () {
    // Function to parse DNS packets picked up by node-dns-sd
    this.dns.ondata = packet => {
      try {
        if (!packet.answers) {
          return
        }
        packet.answers.filter(value => value.name.includes('_ewelink._tcp.local'))
          .filter(value => value.type === 'TXT')
          .filter(value => this.deviceMap.has(value.rdata.id))
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
            const data = rdata.data1 +
              (rdata.data2 || '') +
              (rdata.data3 || '') +
              (rdata.data4 || '')
            const key = this.crypto.createHash('md5')
              .update(Buffer.from(deviceInfo.apiKey, 'utf8')).digest()
            const dText = this.crypto
              .createDecipheriv('aes-128-cbc', key, Buffer.from(rdata.iv, 'base64'))
            const pText = Buffer
              .concat([dText.update(Buffer.from(data, 'base64')), dText.final()])
              .toString('utf8')

            // Check to see if the IP address of the device has changed
            if (packet.address !== deviceInfo.ip && !this.ipOverride[rdata.id]) {
              this.deviceMap.set(rdata.id, {
                apiKey: deviceInfo.apiKey,
                ip: packet.address,
                lastIV: rdata.iv
              })
            }

            // Parse the deconstructed information from the packet
            let params
            try {
              params = JSON.parse(pText)
            } catch (e) {
              this.log.warn(
                '[%s] %s %s:\n%s',
                rdata.id,
                this.lang.cantReadPacket,
                e.message,
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
              params.online = true
              params.updateSource = 'LAN'
              const returnTemplate = {
                deviceid: rdata.id,
                params
              }
              this.emitter.emit('update', returnTemplate)
            }
          })
      } catch (err) {
        const eText = this.funcs.parseError(err)
        this.log.warn('%s %s.', this.lang.cantParsePacket, eText)
      }
    }

    // Start the DNS packet monitoring
    await this.dns.startMonitoring()
    this.log('%s.', this.lang.lanMonitor)
  }

  async sendUpdate (json) {
    try {
      // Check we have an IP address for the device
      if (!this.deviceMap.get(json.deviceid).ip) {
        throw new Error(this.lang.devNotReachLAN)
      }
      let apiKey
      let suffix
      const params = {}

      // /dimmable for D1, /transmit for RF Bridge and /switch /switches are supported
      if (json.params.brightness) {
        params.switch = 'on'
        params.brightness = json.params.brightness
        params.mode = 0
        suffix = 'dimmable'
      } else if (json.params.switches) {
        params.switches = json.params.switches
        suffix = 'switches'
      } else if (json.params.switch) {
        params.switch = json.params.switch
        suffix = 'switch'
      } else if (json.params.cmd) {
        params.cmd = 'transmit'
        params.rfChl = json.params.rfChl
        suffix = 'transmit'
      } else {
        throw new Error(this.lang.devNotConfLAN)
      }

      // Check we have the device API key
      if (!(apiKey = this.deviceMap.get(json.deviceid).apiKey)) {
        throw new Error(this.lang.devNoAPIKey)
      }

      // Generate the HTTP request
      const key = this.crypto.createHash('md5')
        .update(Buffer.from(apiKey, 'utf8')).digest()
      const iv = this.crypto.randomBytes(16)
      const enc = this.crypto.createCipheriv('aes-128-cbc', key, iv)
      const data = {
        data: Buffer.concat([enc.update(JSON.stringify(params)), enc.final()])
          .toString('base64'),
        deviceid: json.deviceid,
        encrypt: true,
        iv: iv.toString('base64'),
        selfApikey: '123',
        sequence: Date.now().toString()
      }

      // Send the HTTP request
      const ip = this.deviceMap.get(json.deviceid).ip
      const res = await this.axios({
        method: 'post',
        url: 'http://' + ip + ':8081/zeroconf/' + suffix,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        data,
        timeout: this.mode === 'lan' ? 9000 : 3000
      })

      // Check for any errors in the response
      if (!res.data || res.data.error !== 0) {
        const error = res.data && res.data.error
          ? res.data.error
          : this.lang.lanErr
        throw new Error(error)
      }

      // This ok is needed by the plugin
      return 'ok'
    } catch (err) {
      return this.funcs.parseError(err)
    }
  }

  receiveUpdate (f) {
    this.emitter.addListener('update', f)
  }

  addDeviceToMap (device) {
    // Adds a device to the map if it is discovered by the plugin
    this.deviceMap.set(device.deviceid, {
      apiKey: device.devicekey,
      ip: this.ipOverride[device.deviceid],
      lastIV: null
    })
  }

  async closeConnection () {
    // This is called when Homebridge is shutdown
    await this.dns.stopMonitoring()
    if (this.debug) {
      this.log('%s.', this.lang.stoppedLAN)
    }
  }
}
