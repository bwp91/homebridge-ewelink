/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class connectionLAN {
  constructor (platform, devices) {
    // *** Set up our variables *** \\
    this.log = platform.log
    this.helpers = platform.helpers
    this.debug = platform.config.debug
    this.ipOverride = platform.ipOverride
    this.deviceMap = new Map()
    this.crypto = require('crypto')
    this.dns = require('node-dns-sd')
    this.emitter = new (require('events'))()

    // *** Create a template map with our device list from the HTTP client *** \\
    devices.forEach(device => {
      if (!this.helpers.devicesLAN.includes(device.extra.uiid)) {
        return
      }
      this.deviceMap.set(device.deviceid, {
        apiKey: device.devicekey,
        ip: this.ipOverride[device.deviceid]
      })
    })
  }

  async getHosts () {
    // *** Perform an initial discovery of devices on the local network *** \\
    const res = await this.dns.discover({
      name: '_ewelink._tcp.local'
    })

    // *** Update the device map for each device found on the local network *** \\
    res.forEach(device => {
      // *** Obtain the ewelink deviceId and check to see it is in our map *** \\
      const deviceId = device.fqdn.replace('._ewelink._tcp.local', '').replace('eWeLink_', '')
      let d
      if ((d = this.deviceMap.get(deviceId)) && !d.ip) {
        // *** Update the map with the found IP address *** \\
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
    // *** Function to parse DNS packets picked up by node-dns-sd *** \\
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

            // *** Check the packet relates to a device in our map *** \\
            const deviceInfo = this.deviceMap.get(rdata.id)

            // *** Skip the update if it's a duplicate *** \\
            if (deviceInfo.lastIV === rdata.iv) {
              return
            }
            deviceInfo.lastIV = rdata.iv
            const data = rdata.data1 + (rdata.data2 || '') + (rdata.data3 || '') + (rdata.data4 || '')
            const key = this.crypto.createHash('md5').update(Buffer.from(deviceInfo.apiKey, 'utf8')).digest()
            const dText = this.crypto.createDecipheriv('aes-128-cbc', key, Buffer.from(rdata.iv, 'base64'))
            const pText = Buffer.concat([dText.update(Buffer.from(data, 'base64')), dText.final()]).toString('utf8')

            // *** Check to see if the IP address of the device has changed *** \\
            if (packet.address !== deviceInfo.ip && !this.ipOverride[rdata.id]) {
              this.deviceMap.set(rdata.id, {
                apiKey: deviceInfo.apiKey,
                ip: packet.address,
                lastIV: rdata.iv
              })
            }

            // *** Parse the deconstructed information from the packet *** \\
            let params
            try {
              params = JSON.parse(pText)
            } catch (e) {
              this.log.warn('[%s] LAN message received could not be read as %s:\n%s', rdata.id, e.message, pText)
              return
            }

            // *** Remove any params we don't need *** \\
            for (const param in params) {
              if (this.helpers.hasProperty(params, param)) {
                if (!this.helpers.paramsToKeep.includes(param.replace(/[0-9]/g, ''))) {
                  delete params[param]
                }
              }
            }

            // *** If any params are left then generate the template to be emitted *** \\
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
        const errToShow = this.debug
          ? ':\n' + err
          : ' ' + err.message + (err.lineNumber ? ' [line ' + err.lineNumber + '].' : '')
        this.log.warn('Could not parse DNS packet as%s', errToShow)
      }
    }

    // *** Start the DNS packet monitoring *** \\
    this.dns.startMonitoring()
  }

  async sendUpdate (json) {
    try {
      // *** Check we have an IP address for the device *** \\
      if (!this.deviceMap.get(json.deviceid).ip) {
        throw new Error('device not reachable via LAN mode')
      }
      let apiKey
      let suffix
      const params = {}

      // *** For now only /switch and /switches are supported *** \\
      if (json.params.switches) {
        params.switches = json.params.switches
        suffix = 'switches'
      } else if (json.params.switch) {
        params.switch = json.params.switch
        suffix = 'switch'
      } else {
        throw new Error('device not configurable via LAN mode')
      }

      // *** Check we have the device API key *** \\
      if (!(apiKey = this.deviceMap.get(json.deviceid).apiKey)) {
        throw new Error('cannot retrieve device API key')
      }

      // *** Generate the HTTP request *** \\
      const key = this.crypto.createHash('md5').update(Buffer.from(apiKey, 'utf8')).digest()
      const iv = this.crypto.randomBytes(16)
      const enc = this.crypto.createCipheriv('aes-128-cbc', key, iv)
      const data = {
        data: Buffer.concat([enc.update(JSON.stringify(params)), enc.final()]).toString('base64'),
        deviceid: json.deviceid,
        encrypt: true,
        iv: iv.toString('base64'),
        selfApikey: '123',
        sequence: Date.now().toString()
      }

      // *** Send the HTTP request *** \\
      const res = await (require('axios'))({
        method: 'post',
        url: 'http://' + this.deviceMap.get(json.deviceid).ip + ':8081/zeroconf/' + suffix,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        data,
        timeout: 3000
      })

      // *** Check for any errors in the response *** \\
      if (!res.data || res.data.error !== 0) {
        throw new Error(res.data)
      }

      // *** This ok is needed by the plugin *** \\
      return 'ok'
    } catch (err) {
      return err.message + (err.lineNumber ? ' [line ' + err.lineNumber + ']' : '')
    }
  }

  receiveUpdate (f) {
    this.emitter.addListener('update', f)
  }

  addDeviceToMap (device) {
    // *** Adds a device to the map if it is discovered by the plugin *** \\
    this.deviceMap.set(device.deviceid, {
      apiKey: device.devicekey,
      ip: this.ipOverride[device.deviceid],
      lastIV: null
    })
  }

  async closeConnection () {
    // *** This is called when Homebridge is shutdown *** \\
    await this.dns.stopMonitoring()
    if (this.debug) {
      this.log('LAN monitoring gracefully stopped.')
    }
  }
}
