'use strict'
const axios = require('axios')
const cns = require('./constants')
const crypto = require('crypto')
const dns = require('node-dns-sd')
const EventEmitter = require('events')
module.exports = class eWeLinkLAN {
  constructor (config, log, devices) {
    this.log = log
    this.config = config
    this.debug = this.config.debug || false
    this.debugReqRes = this.config.debugReqRes || false
    this.ipOverrides = this.config.ipOverride || {}
    this.emitter = new EventEmitter()
    this.devices = devices
    this.deviceMap = new Map()
    devices.forEach(device => {
      this.deviceMap.set(device.deviceid, {
        apiKey: device.devicekey,
        online: !!Object.prototype.hasOwnProperty.call(this.ipOverrides, device.deviceid),
        ip: Object.prototype.hasOwnProperty.call(this.ipOverrides, device.deviceid) ? this.ipOverrides[device.deviceid] : null
      })
    })
  }

  async getHosts () {
    const res = await dns.discover({
      name: '_ewelink._tcp.local'
    })
    res.forEach(device => {
      let d
      const deviceId = device.fqdn.replace('._ewelink._tcp.local', '').replace('eWeLink_', '')
      if ((d = this.deviceMap.get(deviceId))) {
        if (!Object.prototype.hasOwnProperty.call(this.ipOverrides, deviceId)) {
          this.deviceMap.set(deviceId, {
            apiKey: d.apiKey,
            online: true,
            ip: device.address
          })
        }
      }
    })
    return this.deviceMap
  }

  async startMonitor () {
    dns.ondata = packet => {
      if (packet.answers) {
        packet.answers
          .filter(value => value.name.includes('_ewelink._tcp.local'))
          .filter(value => value.type === 'TXT')
          .filter(value => this.deviceMap.has(value.rdata.id))
          .forEach(value => {
            const rdata = value.rdata
            const deviceInfo = this.deviceMap.get(rdata.id)
            const data =
              rdata.data1 +
              (Object.prototype.hasOwnProperty.call(rdata, 'data2') ? rdata.data2 : '') +
              (Object.prototype.hasOwnProperty.call(rdata, 'data3') ? rdata.data3 : '') +
              (Object.prototype.hasOwnProperty.call(rdata, 'data4') ? rdata.data4 : '')
            const key = crypto.createHash('md5').update(Buffer.from(deviceInfo.apiKey, 'utf8')).digest()
            const dText = crypto.createDecipheriv('aes-128-cbc', key, Buffer.from(rdata.iv, 'base64'))
            const pText = Buffer.concat([dText.update(Buffer.from(data, 'base64')), dText.final()]).toString('utf8')
            let params
            if (packet.address !== deviceInfo.ip && !Object.prototype.hasOwnProperty.call(this.ipOverrides, rdata.id)) {
              this.deviceMap.set(rdata.id, {
                apiKey: deviceInfo.apiKey,
                online: true,
                ip: packet.address
              })
              if (this.debug) {
                this.log.warn('[%s] updating IP address to [%s].', rdata.id, packet.address)
              }
            }
            try {
              params = JSON.parse(pText)
            } catch (e) {
              this.log.warn('[%s] An error occured reading the LAN message [%s]', rdata.id, e)
              return
            }
            for (const param in params) {
              if (Object.prototype.hasOwnProperty.call(params, param)) {
                if (!cns.paramsToKeep.includes(param.replace(/[0-9]/g, ''))) {
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
    dns.startMonitoring()
  }

  async sendUpdate (json) {
    if (!this.deviceMap.get(json.deviceid).online) {
      throw new Error("device isn't reachable via LAN mode")
    }
    let apiKey
    let suffix
    const params = {}
    if (Object.prototype.hasOwnProperty.call(json.params, 'switches')) {
      params.switches = json.params.switches
      suffix = 'switches'
    } else if (Object.prototype.hasOwnProperty.call(json.params, 'switch')) {
      params.switch = json.params.switch
      suffix = 'switch'
    } else {
      throw new Error("device isn't reachable via LAN mode")
    }
    if ((apiKey = this.deviceMap.get(json.deviceid).apiKey)) {
      const key = crypto.createHash('md5').update(Buffer.from(apiKey, 'utf8')).digest()
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
      if (this.debugReqRes) {
        const msg = JSON.stringify(json, null, 2)
          .replace(json.apikey, '**hidden**')
          .replace(json.apikey, '**hidden**')
          .replace(json.deviceid, '**hidden**')
        this.log.warn('LAN message sent. This text is yellow for clarity.\n%s', msg)
      } else if (this.debug) {
        this.log('LAN message sent.')
      }
      const res = await axios({
        method: 'post',
        url: 'http://' + this.deviceMap.get(json.deviceid).ip + ':8081/zeroconf/' + suffix,
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json'
        },
        data
      })
      if (!Object.prototype.hasOwnProperty.call(res.data, 'error') || res.data.error !== 0) {
        throw new Error(res.data)
      }
    }
  }

  receiveUpdate (f) {
    this.emitter.addListener('update', f)
  }

  addDeviceToMap (device) {
    this.deviceMap.set(device.deviceid, {
      apiKey: device.devicekey,
      online: !!Object.prototype.hasOwnProperty.call(this.ipOverrides, device.deviceid),
      ip: Object.prototype.hasOwnProperty.call(this.ipOverrides, device.deviceid) ? this.ipOverrides[device.deviceid] : null
    })
  }

  async closeConnection () {
    try {
      await dns.stopMonitoring()
      this.log('LAN monitoring gracefully stopped.')
    } catch (err) {
      this.log.warn('LAN monitoring could not be stopped as %s', this.debug ? err : err.message)
    }
  }
}
