'use strict'
const axios = require('axios')
const cns = require('./constants')
const EventEmitter = require('events')
const utils = require('./utils')
const WS = require('ws')
const WSP = require('websocket-as-promised')
module.exports = class eWeLinkWS {
  constructor (config, log, res) {
    this.config = config
    this.log = log
    this.debug = this.config.debug || false
    this.debugReqRes = this.config.debugReqRes || false
    this.httpHost = res.httpHost
    this.aToken = res.aToken
    this.apiKey = res.apiKey
    this.wsIsOpen = false
    this.emitter = new EventEmitter()
    this.delaySend = 0
  }

  async getHost () {
    try {
      const res = await axios({
        method: 'post',
        url: 'https://' +
          this.httpHost.replace('-api', '-disp') +
          '/dispatch/app',
        headers: {
          Authorization: 'Bearer ' + this.aToken,
          'Content-Type': 'application/json'
        },
        data: {
          appid: cns.appId,
          nonce: Math.random().toString(36).substr(2, 8),
          ts: Math.floor(new Date().getTime() / 1000),
          version: 8
        }
      })
      const body = res.data
      if (!body.domain) {
        throw new Error('Server did not respond with a web socket host.')
      }
      if (this.debug) {
        this.log('Web socket host received [%s].', body.domain)
      }
      this.wsHost = body.domain
      return body.domain
    } catch (err) {
      if (
        Object.prototype.hasOwnProperty.call(err, 'code') && ['ENOTFOUND', 'ETIMEDOUT'].includes(err.code)
      ) {
        this.log.warn('Unable to reach eWeLink. Retrying in 30 seconds.')
        await utils.sleep(30000)
        return this.getDevices()
      } else {
        throw err
      }
    }
  }

  login () {
    this.wsp = new WSP('wss://' + this.wsHost + ':8080/api/ws', {
      createWebSocket: (url) => new WS(url),
      extractMessageData: (event) => event,
      attachRequestId: (data, requestId) =>
        Object.assign({
          sequence: requestId
        },
        data
        ),
      extractRequestId: (data) => data && data.sequence,
      packMessage: (data) => JSON.stringify(data),
      unpackMessage: (data) => {
        return data === 'pong' ? data : JSON.parse(data)
      }
    })
    this.wsp.open()
    this.wsp.onOpen.addListener(async () => {
      this.wsIsOpen = true
      const sequence = Math.floor(new Date()).toString()
      const payload = {
        action: 'userOnline',
        apikey: this.apiKey,
        appid: cns.appId,
        at: this.aToken,
        nonce: Math.random().toString(36).substr(2, 8),
        sequence,
        ts: Math.floor(new Date() / 1000),
        userAgent: 'app',
        version: 8
      }
      if (this.debugReqRes) {
        const msg = JSON.stringify(payload, null, 2)
          .replace(this.aToken, '**hidden**')
          .replace(this.apiKey, '**hidden**')
        this.log.warn(
          'Sending WS login request. This text is yellow for clarity.\n%s',
          msg
        )
      } else if (this.debug) {
        this.log('Sending WS login request.')
      }
      try {
        const res = await this.wsp.sendRequest(payload, {
          requestId: sequence
        })
        if (
          Object.prototype.hasOwnProperty.call(res, 'config') &&
          res.config.hb &&
          res.config.hbInterval &&
          !this.hbInterval
        ) {
          this.hbInterval = setInterval(() => {
            this.wsp.send('ping')
          }, (res.config.hbInterval + 7) * 1000)
        } else {
          throw new Error('Unknown parameters received')
        }
      } catch (err) {
        this.log.error('WS login failed [%s].', err)
      }
    })
    this.wsp.onUnpackedMessage.addListener((device) => {
      if (device === 'pong') return
      let onlineStatus = true
      if (!Object.prototype.hasOwnProperty.call(device, 'params')) device.params = {}
      if (Object.prototype.hasOwnProperty.call(device, 'deviceid') && Object.prototype.hasOwnProperty.call(device, 'error')) {
        device.action = 'update'
        onlineStatus = device.error === 0
      }
      if (Object.prototype.hasOwnProperty.call(device, 'action')) {
        switch (device.action) {
          case 'update':
          case 'sysmsg':
            if (
              device.action === 'sysmsg' &&
              Object.prototype.hasOwnProperty.call(device.params, 'online')
            ) {
              onlineStatus = device.params.online
            }
            for (const param in device.params) {
              if (Object.prototype.hasOwnProperty.call(device.params, param)) {
                if (!cns.paramsToKeep.includes(param.replace(/[0-9]/g, ''))) {
                  delete device.params[param]
                }
              }
            }
            device.params.online = onlineStatus
            device.params.updateSource = 'WS'
            if (Object.keys(device.params).length > 0) {
              const returnTemplate = {
                deviceid: device.deviceid,
                params: device.params
              }
              if (this.debugReqRes) {
                const msg = JSON.stringify(returnTemplate, null, 2).replace(
                  device.deviceid,
                  '**hidden**'
                )
                this.log('WS message received.\n%s', msg)
              } else if (this.debug) {
                this.log('WS message received.')
              }
              this.emitter.emit('update', returnTemplate)
            }
            break
          case 'reportSubDevice':
            return
          default:
            this.log.warn(
              '[%s] WS message has unknown action.\n' +
              JSON.stringify(device, null, 2),
              device.deviceid
            )
        }
      } else if (Object.prototype.hasOwnProperty.call(device, 'error') && device.error === 0) {
        // *** Safe to ignore these messages *** \\
      } else {
        if (this.debug) {
          this.log.warn(
            'WS unknown command received.\n' + JSON.stringify(device, null, 2)
          )
        }
      }
    })
    this.wsp.onClose.addListener((e, m) => {
      this.wsIsOpen = false
      if (e !== 1005) {
        this.log.warn('Web socket closed [%s].', e)
        if (e !== 1000) {
          this.log('Web socket will try to reconnect in five seconds.')
          setTimeout(() => this.login(), 5000)
        } else {
          this.log(
            'Please try restarting Homebridge so that this plugin can work again.'
          )
        }
      }
      if (this.hbInterval) {
        clearInterval(this.hbInterval)
        this.hbInterval = null
      }
      this.wsp.removeAllListeners()
    })
    this.wsp.onError.addListener((e) => {
      this.log.error('Web socket error - [%s].', e)
      if (e.code === 'ECONNREFUSED') {
        this.log.warn(
          'Web socket will try to reconnect in five seconds then try the command again.'
        )
        this.wsp.removeAllListeners()
        setTimeout(() => this.login(), 5000)
      } else {
        this.log.warn(
          'If this was unexpected then please try restarting Homebridge.'
        )
      }
    })
  }

  async sendUpdate (json) {
    const sequence = Math.floor(new Date()).toString()
    const jsonToSend = {
      ...json,
      ...{
        action: 'update',
        sequence,
        userAgent: 'app'
      }
    }
    if (this.wsp && this.wsIsOpen) {
      try {
        const device = await this.wsp.sendRequest(jsonToSend, {
          requestId: sequence
        })
        if (this.debugReqRes) {
          const msg = JSON.stringify(json, null, 2)
            .replace(json.apikey, '**hidden**')
            .replace(json.apiKey, '**hidden**')
            .replace(json.deviceid, '**hidden**')
          this.log.warn(
            'WS message sent. This text is yellow for clarity.\n%s',
            msg
          )
        } else if (this.debug) {
          this.log('WS message sent.')
        }
        device.error = Object.prototype.hasOwnProperty.call(device, 'error') ? device.error : 504
        switch (device.error) {
          case 0:
            return
          default:
            throw new Error('Unknown response')
        }
      } catch (err) {
        throw new Error('device update failed [' + err.message + ']')
      }
    } else {
      if (this.debug) {
        this.log.warn('Command will be resent when WS is reconnected.')
      }
      await utils.sleep(30000)
      return this.sendUpdate(json)
    }
  }

  async requestUpdate (accessory) {
    const sequence = Math.floor(new Date()).toString()
    const json = {
      action: 'query',
      apikey: accessory.context.eweApiKey,
      deviceid: accessory.context.eweDeviceId,
      params: [],
      sequence,
      ts: 0,
      userAgent: 'app'
    }
    if (this.wsp && this.wsIsOpen) {
      this.wsp.send(JSON.stringify(json))
      if (this.debugReqRes) {
        const msg = JSON.stringify(json, null, 2)
          .replace(json.apikey, '**hidden**')
          .replace(json.apiKey, '**hidden**')
          .replace(json.deviceid, '**hidden**')
        this.log.warn(
          'WS message sent. This text is yellow for clarity.\n%s',
          msg
        )
      } else if (this.debug) {
        this.log('WS message sent.')
      }
    } else {
      if (this.debug) {
        this.log.warn('Command will be resent when WS is reconnected.')
      }
      await utils.sleep(30000)
      return this.requestUpdate(accessory)
    }
  }

  receiveUpdate (f) {
    this.emitter.addListener('update', f)
  }

  async closeConnection () {
    if (this.wsp && this.wsIsOpen) {
      await this.wsp.close()
      this.log('Web socket gracefully closed.')
    }
  }
}
