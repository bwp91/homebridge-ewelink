/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class connectionLAN {
  constructor (config, log, helpers, ipOverride, devices) {
    this.log = log
    this.config = config
    this.helpers = helpers
    this.ipOverride = ipOverride
    this.debug = this.config.debug || false
    this.debugReqRes = this.config.debugReqRes || false
    this.emitter = new (require('events'))()
    this.devices = devices
    this.deviceMap = new Map()
    devices.forEach(device => {
      this.deviceMap.set(device.deviceid, {
        apiKey: device.devicekey,
        online: this.helpers.hasProperty(this.ipOverride, device.deviceid),
        ip: this.helpers.hasProperty(this.ipOverride, device.deviceid) ? this.ipOverride[device.deviceid] : null,
        lastIV: null
      })
    })
    this.crypto = require('crypto')
    this.dns = require('node-dns-sd')
  }

  async getHosts () {
    const res = await this.dns.discover({ name: '_ewelink._tcp.local' })
    res.forEach(device => {
      let d
      const deviceId = device.fqdn.replace('._ewelink._tcp.local', '').replace('eWeLink_', '')
      if ((d = this.deviceMap.get(deviceId))) {
        if (!this.helpers.hasProperty(this.ipOverride, deviceId)) {
          this.deviceMap.set(deviceId, {
            apiKey: d.apiKey,
            online: true,
            ip: device.address,
            lastIV: null
          })
        }
      }
    })
    return this.deviceMap
  }

  async startMonitor () {
    this.dns.ondata = packet => {
      if (packet.answers) {
        packet.answers
          .filter(value => value.name.includes('_ewelink._tcp.local'))
          .filter(value => value.type === 'TXT')
          .filter(value => this.deviceMap.has(value.rdata.id))
          .forEach(value => {
            const rdata = value.rdata
            const deviceInfo = this.deviceMap.get(rdata.id)
            if (deviceInfo.lastIV === rdata.iv) return
            deviceInfo.lastIV = rdata.iv
            const data =
              rdata.data1 +
              (this.helpers.hasProperty(rdata, 'data2') ? rdata.data2 : '') +
              (this.helpers.hasProperty(rdata, 'data3') ? rdata.data3 : '') +
              (this.helpers.hasProperty(rdata, 'data4') ? rdata.data4 : '')
            const key = this.crypto.createHash('md5').update(Buffer.from(deviceInfo.apiKey, 'utf8')).digest()
            const dText = this.crypto.createDecipheriv('aes-128-cbc', key, Buffer.from(rdata.iv, 'base64'))
            const pText = Buffer.concat([dText.update(Buffer.from(data, 'base64')), dText.final()]).toString('utf8')
            let params
            if (packet.address !== deviceInfo.ip && !this.helpers.hasProperty(this.ipOverride, rdata.id)) {
              this.deviceMap.set(rdata.id, {
                apiKey: deviceInfo.apiKey,
                online: true,
                ip: packet.address,
                lastIV: rdata.iv
              })
              if (this.debug) this.log.warn('[%s] updating IP address to [%s].', rdata.id, packet.address)
            }
            try {
              params = JSON.parse(pText)
            } catch (e) {
              if (this.debug) this.log.warn('[%s] An error occured reading the LAN message [%s]', rdata.id, e)
              return
            }
            for (const param in params) {
              if (this.helpers.hasProperty(params, param)) {
                if (!this.helpers.paramsToKeep.includes(param.replace(/[0-9]/g, ''))) {
                  delete params[param]
                }
              }
            }
            if (Object.keys(params).length > 0) {
              params.updateSource = 'LAN'
              params.online = true
              const returnTemplate = {
                deviceid: rdata.id,
                params
              }
              if (this.debugReqRes) {
                const msg = JSON.stringify(returnTemplate, null, 2).replace(rdata.id, '**hidden**')
                this.log('LAN message received.\n%s', msg)
              } else if (this.debug) {
                this.log('LAN message received.')
              }
              this.emitter.emit('update', returnTemplate)
            }
          })
      }
    }
    this.dns.startMonitoring()
  }

  async sendUpdate (json) {
    try {
      if (!this.deviceMap.get(json.deviceid).online) {
        throw new Error("device isn't reachable via LAN mode")
      }
      let apiKey
      let suffix
      const params = {}
      if (this.helpers.hasProperty(json.params, 'switches')) {
        params.switches = json.params.switches
        suffix = 'switches'
      } else if (this.helpers.hasProperty(json.params, 'switch')) {
        params.switch = json.params.switch
        suffix = 'switch'
      } else {
        throw new Error("device isn't configurable via LAN mode")
      }
      if ((apiKey = this.deviceMap.get(json.deviceid).apiKey)) {
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
        if (this.debugReqRes) {
          const msg = JSON.stringify(json, null, 2)
            .replace(json.apikey, '**hidden**')
            .replace(json.deviceid, '**hidden**')
          this.log.warn('LAN message sent. This text is yellow for clarity.\n%s', msg)
        } else if (this.debug) {
          this.log('LAN message sent.')
        }
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
        if (!this.helpers.hasProperty(res.data, 'error') || res.data.error !== 0) {
          throw new Error(res.data)
        }
        return 'ok'
      }
    } catch (err) {
      return err.message
    }
  }

  receiveUpdate (f) {
    this.emitter.addListener('update', f)
  }

  addDeviceToMap (device) {
    this.deviceMap.set(device.deviceid, {
      apiKey: device.devicekey,
      online: this.helpers.hasProperty(this.ipOverride, device.deviceid),
      ip: this.helpers.hasProperty(this.ipOverride, device.deviceid) ? this.ipOverride[device.deviceid] : null,
      lastIV: null
    })
  }

  async closeConnection () {
    await this.dns.stopMonitoring()
    if (this.debug) this.log('LAN monitoring gracefully stopped.')
  }
}
