/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class connectionWS {
  constructor (config, log, helpers, authData) {
    this.config = config
    this.log = log
    this.helpers = helpers
    this.debug = this.config.debug || false
    this.debugReqRes = this.config.debugReqRes || false
    this.httpHost = authData.httpHost
    this.aToken = authData.aToken
    this.apiKey = authData.apiKey
    this.wsIsOpen = false
    this.emitter = new (require('events'))()
  }

  async getHost () {
    try {
      const res = await (require('axios'))({
        method: 'post',
        url: 'https://' + this.httpHost.replace('-api', '-disp') + '/dispatch/app',
        headers: {
          Authorization: 'Bearer ' + this.aToken,
          'Content-Type': 'application/json'
        },
        data: {
          appid: this.helpers.appId,
          nonce: Math.random().toString(36).substr(2, 8),
          ts: Math.floor(new Date().getTime() / 1000),
          version: 8
        }
      })
      const body = res.data
      if (!body.domain) {
        throw new Error('Server did not respond with a web socket host.')
      }
      if (this.debug) this.log('Web socket host received [%s].', body.domain)
      this.wsHost = body.domain
    } catch (err) {
      if (this.helpers.hasProperty(err, 'code') && this.helpers.httpRetryCodes.includes(err.code)) {
        if (this.debug) this.log.warn('Unable to reach eWeLink. Retrying in 30 seconds.')
        await this.helpers.sleep(30000)
        return await this.getHost()
      } else {
        throw err
      }
    }
  }

  login () {
    this.wsp = new (require('websocket-as-promised'))('wss://' + this.wsHost + ':8080/api/ws', {
      createWebSocket: url => new (require('ws'))(url),
      extractMessageData: event => event,
      attachRequestId: (data, requestId) => Object.assign({ sequence: requestId }, data),
      extractRequestId: data => data && data.sequence,
      packMessage: data => JSON.stringify(data),
      unpackMessage: data => data === 'pong' ? data : JSON.parse(data)
    })
    this.wsp.open()
    this.wsp.onOpen.addListener(async () => {
      this.wsIsOpen = true
      const sequence = Math.floor(new Date()).toString()
      const payload = {
        action: 'userOnline',
        apikey: this.apiKey,
        appid: this.helpers.appId,
        at: this.aToken,
        nonce: Math.random().toString(36).substr(2, 8),
        sequence,
        ts: Math.floor(new Date() / 1000),
        userAgent: 'app',
        version: 8
      }
      if (this.debugReqRes) {
        const msg = JSON.stringify(payload, null, 2).replace(this.aToken, '**hidden**').replace(this.apiKey, '**hidden**')
        this.log.warn('Sending WS login request. This text is yellow for clarity.\n%s', msg)
      } else if (this.debug) {
        this.log('Sending WS login request.')
      }
      try {
        const res = await this.wsp.sendRequest(payload, { requestId: sequence })
        if (this.helpers.hasProperty(res, 'config') && res.config.hb && res.config.hbInterval) {
          if (this.hbInterval) clearInterval(this.hbInterval)
          this.hbInterval = setInterval(() => {
            try {
              this.wsp.send('ping')
            } catch (err) {
              if (this.debug) this.log('Error sending ping - %.', err.message)
            }
          }, (res.config.hbInterval + 7) * 1000)
        } else {
          throw new Error('Unknown parameters received\n' + JSON.stringify(res, null, 2))
        }
      } catch (err) {
        this.log.error('WS login failed [%s].', this.debug ? err : err.message)
      }
    })
    this.wsp.onUnpackedMessage.addListener(device => {
      if (device === 'pong') return
      let onlineStatus = true
      if (!this.helpers.hasProperty(device, 'params')) device.params = {}
      if (this.helpers.hasProperty(device, 'deviceid') && this.helpers.hasProperty(device, 'error')) {
        device.action = 'update'
        onlineStatus = device.error === 0
        if (device.error !== 0 && this.debug) {
          this.log.warn('WS message received.\n%s', JSON.stringify(device, null, 2).replace(this.apiKey, '**hidden**'))
        }
      }
      if (this.helpers.hasProperty(device, 'action')) {
        switch (device.action) {
          case 'update':
          case 'sysmsg':
            if (device.action === 'sysmsg' && this.helpers.hasProperty(device.params, 'online')) {
              onlineStatus = device.params.online
            }
            for (const param in device.params) {
              if (this.helpers.hasProperty(device.params, param)) {
                if (!this.helpers.paramsToKeep.includes(param.replace(/[0-9]/g, ''))) {
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
                const msg = JSON.stringify(returnTemplate, null, 2).replace(device.deviceid, '**hidden**')
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
            if (this.debug) {
              this.log.warn('[%s] WS message has unknown action.\n' + JSON.stringify(device, null, 2), device.deviceid)
            }
        }
      } else if (this.helpers.hasProperty(device, 'error') && device.error === 0) {
        // *** Safe to ignore these messages *** \\
      } else {
        if (this.debug) this.log.warn('WS unknown command received.\n' + JSON.stringify(device, null, 2))
      }
    })
    this.wsp.onClose.addListener(async e => {
      this.wsIsOpen = false
      if (this.hbInterval) {
        clearInterval(this.hbInterval)
        this.hbInterval = null
      }
      this.wsp.removeAllListeners()
      if (e === 1005) return
      if (this.debug) {
        this.log.warn('Web socket closed - [%s].', e)
        this.log.warn('Web socket will try to reconnect in five seconds.')
      }
      await this.helpers.sleep(5000)
      await this.login()
    })
    this.wsp.onError.addListener(async e => {
      this.wsIsOpen = false
      if (this.hbInterval) {
        clearInterval(this.hbInterval)
        this.hbInterval = null
      }
      this.wsp.removeAllListeners()
      if (this.debug) {
        this.log.warn('Web socket error - [%s].', e)
        this.log.warn('Web socket will try to reconnect in five seconds.')
      }
      await this.helpers.sleep(5000)
      await this.login()
    })
  }

  async sendUpdate (json) {
    const sequence = Math.floor(new Date()).toString()
    const jsonToSend = {
      ...json,
      ...{
        action: 'update',
        sequence,
        ts: 0,
        userAgent: 'app'
      }
    }
    if (this.wsp && this.wsIsOpen) {
      try {
        if (this.debugReqRes) {
          const msg = JSON.stringify(jsonToSend, null, 2).replace(json.apikey, '**hidden**').replace(json.apiKey, '**hidden**').replace(json.deviceid, '**hidden**')
          this.log.warn('WS message sent. This text is yellow for clarity.\n%s', msg)
        } else if (this.debug) {
          this.log('WS message sent.')
        }
        const device = await this.wsp.sendRequest(jsonToSend, { requestId: sequence })
        device.error = this.helpers.hasProperty(device, 'error') ? device.error : 504
        switch (device.error) {
          case 0:
            return
          default:
            throw new Error('Unknown response')
        }
      } catch (err) {
        const msg = this.debug ? err : err.message
        return new Error('device update failed as ' + msg)
      }
    } else {
      if (this.debug) this.log.warn('Command will be resent when WS is reconnected.')
      await this.helpers.sleep(30000)
      await this.sendUpdate(json)
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
          .replace(json.apiKey, '**hidden**')
          .replace(json.deviceid, '**hidden**')
        this.log.warn('WS message sent. This text is yellow for clarity.\n%s', msg)
      } else if (this.debug) {
        this.log('WS message sent.')
      }
    } else {
      if (this.debug) this.log.warn('Command will be resent when WS is reconnected.')
      await this.helpers.sleep(30000)
      await this.requestUpdate(accessory)
    }
  }

  receiveUpdate (f) {
    this.emitter.addListener('update', f)
  }

  async closeConnection () {
    if (this.wsp && this.wsIsOpen) {
      await this.wsp.close()
      if (this.debug) this.log('Web socket gracefully closed.')
    }
  }
}
