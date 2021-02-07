/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class connectionWS {
  constructor (platform, authData) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.funcs = platform.funcs
    this.log = platform.log
    this.messages = platform.messages

    // Set up config variables from the platform
    this.debug = platform.config.debug

    // Set up libraries from the platform
    this.axios = platform.axios
    this.emitter = platform.emitter

    // Set up variables from the authData (from HTTP)
    this.httpHost = authData.httpHost
    this.aToken = authData.aToken
    this.apiKey = authData.apiKey

    // Set up other libraries needed by this class
    this.ws = require('ws')
    this.wsp = require('websocket-as-promised')
  }

  async getHost () {
    // Used to get the web socket host
    try {
      // Send the HTTP request to get the web socket host
      const res = await this.axios({
        method: 'post',
        url: 'https://' + this.httpHost.replace('-api', '-disp') + '/dispatch/app',
        headers: {
          Authorization: 'Bearer ' + this.aToken,
          'Content-Type': 'application/json'
        },
        data: {
          appid: this.consts.appId,
          nonce: Math.random().toString(36).substr(2, 8),
          ts: Math.floor(new Date().getTime() / 1000),
          version: 8
        }
      })

      // Parse the response
      const body = res.data

      // Check for any reason a host wasn't received
      if (!body.domain) {
        throw new Error(this.messages.noWSHost)
      }

      // Log the received host if appropriate
      if (this.debug) {
        this.log('%s [%s].', this.messages.wsHostRec, body.domain)
      }

      // Make the received host global
      this.wsHost = body.domain
    } catch (err) {
      // Check to see if it's a eWeLink server problem and we can retry
      if (err.code && this.consts.httpRetryCodes.includes(err.code)) {
        // Retry if another attempt could be successful
        this.log.warn('%s.', this.messages.httpRetry)
        await this.funcs.sleep(30000)
        return await this.getHost()
      } else {
        // It's not a eWeLink problem so report the error back
        throw err
      }
    }
  }

  login () {
    // Used to create the web socket connection and authenticate

    // Create the web socket client
    this.wsClient = new this.wsp('wss://' + this.wsHost + ':8080/api/ws', {
      createWebSocket: url => new this.ws(url),
      extractMessageData: event => event,
      attachRequestId: (data, requestId) => Object.assign({ sequence: requestId }, data),
      extractRequestId: data => data && data.sequence,
      packMessage: data => JSON.stringify(data),
      unpackMessage: data => data === 'pong' ? data : JSON.parse(data)
    })

    // Open the web socket connection
    this.wsClient.open()

    // Add a listener to authenticate when a web socket connection is opened
    this.wsClient.onOpen.addListener(async () => {
      this.wsIsOpen = true
      const sequence = Math.floor(new Date()).toString()

      // Generate the login payload for the web socket
      const payload = {
        action: 'userOnline',
        apikey: this.apiKey,
        appid: this.consts.appId,
        at: this.aToken,
        nonce: Math.random().toString(36).substr(2, 8),
        sequence,
        ts: Math.floor(new Date() / 1000),
        userAgent: 'app',
        version: 8
      }

      // Log the web socket login if appropriate
      if (this.debug) {
        this.log('%s.', this.messages.wsLogin)
      }

      // Attempt to authenticate the web socket connection
      try {
        // Send the request
        const res = await this.wsClient.sendRequest(payload, { requestId: sequence })

        // Parse the response
        if (res.config && res.config.hb && res.config.hbInterval) {
          // Clear any existing ping intervals
          if (this.hbInterval) {
            clearInterval(this.hbInterval)
          }

          // Create a new ping interval
          this.hbInterval = setInterval(() => {
            try {
              // Send the ping
              this.wsClient.send('ping')
            } catch (err) {
              // Catch errors sending ping and show in debug mode
              if (this.debug) {
                const eText = this.funcs.parseError(err)
                this.log.warn('%s %s.', this.messages.wsPingError, eText)
              }
            }
          }, (res.config.hbInterval + 7) * 1000)

          // Login was successful and log if appropriate
          if (this.debug) {
            this.log('%s.', this.messages.wsLoginSuccess)
          }
        } else {
          // There was a problem with the authentication response
          throw new Error(this.messages.wsLoginErr + '\n' + JSON.stringify(res, null, 2))
        }
      } catch (err) {
        // Catch any errors authenicating the WS connection
        const eText = this.funcs.parseError(err)
        this.log.warn('%s %s.', this.messages.wsLoginError, eText)
      }
    })

    // Add a listener for when we receive a WS message
    this.wsClient.onUnpackedMessage.addListener(device => {
      // Don't continue if it's a simple pong
      if (device === 'pong') {
        return
      }

      // Set a device online flag now which we can change later
      let onlineStatus = true

      // Set up a params object if one didn't already come within the message
      if (!device.params) {
        device.params = {}
      }

      // We received a device on/offline or error notification
      if (device.deviceid && this.funcs.hasProperty(device, 'error')) {
        device.action = 'update'

        // Set the online status of the device
        onlineStatus = device.error === 0

        // Check if the device has reported an error
        if (device.error !== 0) {
          const str = JSON.stringify(device, null, 2)
          const redacted = str.replace(this.apiKey, '**hidden**')
          this.log.warn('[%s] %s.\n%s', device.deviceid, this.messages.wsRec, redacted)
        }
      }

      // Normally the WS messages comes with an action
      if (device.action) {
        // Check which action the WS message includes
        switch (device.action) {
          case 'update':
          case 'sysmsg': {
            if (
              device.action === 'sysmsg' &&
              this.funcs.hasProperty(device.params, 'online')
            ) {
              // Update the online/offline status provided in the message
              onlineStatus = device.params.online
            }

            // Loop through the device parameters received
            for (const param in device.params) {
              if (this.funcs.hasProperty(device.params, param)) {
                // Remove any params that the plugin doesn't need
                if (!this.consts.paramsToKeep.includes(param.replace(/[0-9]/g, ''))) {
                  delete device.params[param]
                }
              }
            }

            // Add more params to report back to the plugin
            device.params.online = onlineStatus
            device.params.updateSource = 'WS'

            // Generate the object to return to the plugin
            const returnTemplate = {
              deviceid: device.deviceid,
              params: device.params
            }

            // Report the new device params object back to the plugin to deal with
            this.emitter.emit('update', returnTemplate)
            break
          }
          case 'reportSubDevice':
            // We don't need to do anything with this action
            return
          default: {
            const str = JSON.stringify(device, null, 2)
            this.log.warn('[%s] %s.\n%s', device.deviceid, this.messages.wsUnkAct, str)
          }
        }
      } else if (this.funcs.hasProperty(device, 'error') && device.error === 0) {
        // Safe to ignore these messages
      } else {
        // WS message received has an unknown action
        this.log.warn('%s.\n%s', this.messages.wsUnkCmd, JSON.stringify(device, null, 2))
      }
    })

    // Add a listener for when the web socket closes for any reason
    this.wsClient.onClose.addListener(async e => {
      // Set the global flag to false
      this.wsIsOpen = false

      // Clear the ping interval
      if (this.hbInterval) {
        clearInterval(this.hbInterval)
        this.hbInterval = null
      }

      // Remove all existing listeners for web socket events
      this.wsClient.removeAllListeners()

      // Don't continue further with logging/reconnection if it's a wanted closure
      if (e === 1005) {
        return
      }

      // Log that the web socket has closed if appropriate
      if (this.debug) {
        this.log.warn('%s, %s.', this.messages.wsReconnect, e)
      }

      // Wait for 5 seconds and try to re-establish the web socket connection
      await this.funcs.sleep(5000)
      await this.login()
    })

    // Add a listener for when the web socket throws an error
    this.wsClient.onError.addListener(async e => {
      // Set the global flag to false
      this.wsIsOpen = false

      // Clear the ping interval
      if (this.hbInterval) {
        clearInterval(this.hbInterval)
        this.hbInterval = null
      }

      // Remove all existing listeners for web socket events
      this.wsClient.removeAllListeners()

      // Log that the web socket has closed if appropriate
      if (this.debug) {
        this.log.warn('%s, %s.', this.messages.wsReconnect, e)
      }

      // Wait for 5 seconds and try to re-establish the web socket connection
      await this.funcs.sleep(5000)
      await this.login()
    })
  }

  async sendUpdate (json) {
    // Used to send a device update to eWeLink
    const sequence = Math.floor(new Date()).toString()

    // Generate the payload to send
    const toSend = {
      ...json,
      ...{
        action: 'update',
        sequence,
        ts: 0,
        userAgent: 'app'
      }
    }

    // Check the web socket is open
    if (this.wsClient && this.wsIsOpen) {
      try {
        // Send the request to eWeLink
        const res = await this.wsClient.sendRequest(toSend, { requestId: sequence })

        // Parse the response and see if any error has been reported back
        res.error = this.funcs.hasProperty(res, 'error') ? res.error : 504

        // Check if and which error has been reported back
        switch (res.error) {
          case 0:
            // No error is always what is wanted
            return
          default:
            // An error has occurred
            throw new Error(this.messages.wsUnkRes)
        }
      } catch (err) {
        // Catch any errors sending the device update
        const eText = this.funcs.parseError(err)
        return new Error(this.messages.devNotUpd + ' ' + eText)
      }
    } else {
      // The web socket isn't currently open so log this
      this.log.warn('%s.', this.messages.wsResend)

      // Try sending the update again in 30 seconds when it's hopefully open again
      await this.funcs.sleep(30000)
      await this.sendUpdate(json)
    }
  }

  receiveUpdate (f) {
    this.emitter.addListener('update', f)
  }

  async requestUpdate (accessory) {
    // Used to request a device update from eWeLink
    const sequence = Math.floor(new Date()).toString()

    // Generate the payload to send
    const json = {
      action: 'query',
      apikey: accessory.context.eweApiKey,
      deviceid: accessory.context.eweDeviceId,
      params: [],
      sequence,
      ts: 0,
      userAgent: 'app'
    }

    // Log the action if appropriate
    if (this.debug) {
      this.log('[%s] %s.', accessory.displayName, this.messages.updReq)
    }

    // Check the web socket is open
    if (this.wsClient && this.wsIsOpen) {
      // Send the request
      this.wsClient.send(JSON.stringify(json))
    } else {
      // The web socket isn't currently open so log this
      this.log.warn('[%s] %s.', accessory.displayName, this.messages.wsResend)

      // Try sending the update again in 30 seconds when it's hopefully open again
      await this.funcs.sleep(30000)
      await this.requestUpdate(accessory)
    }
  }

  async closeConnection () {
    // This is called when Homebridge is shutdown
    if (this.wsClient && this.wsIsOpen) {
      // Close the web socket connection
      await this.wsClient.close()

      // Log if appropriate
      if (this.debug) {
        this.log('%s.', this.messages.stoppedWS)
      }
    }
  }
}
