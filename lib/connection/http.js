/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = class connectionHTTP {
  constructor (platform) {
    // *** Set up our variables *** \\
    this.log = platform.log
    this.helpers = platform.helpers
    this.debug = platform.config.debug
    this.username = platform.config.username.toString().replace(/[\s]+/g, '')
    this.password = platform.config.password.toString()
    this.ignoredDevices = platform.ignoredDevices
    this.obstructSwitches = platform.obstructSwitches
    this.cCode = '+' + platform.config.countryCode.toString().replace(/[\s+]+/g, '')
    this.axios = require('axios')
    this.crypto = require('crypto')
  }

  async getHost () {
    // *** Used to get the user's regional (continent) HTTP API host *** \\
    const params = {
      appid: this.helpers.appId,
      country_code: this.cCode,
      nonce: Math.random().toString(36).substr(2, 8),
      ts: Math.floor(new Date().getTime() / 1000),
      version: 8
    }

    // *** Set up the request signature *** \\
    let dataToSign = []
    try {
      Object.keys(params).forEach(k => {
        dataToSign.push({
          key: k,
          value: params.k
        })
      })
      dataToSign.sort((a, b) => (a.key < b.key ? -1 : 1))
      dataToSign = dataToSign.map(k => k.key + '=' + k.value).join('&')
      dataToSign = this.crypto.createHmac('sha256', this.helpers.appSecret).update(dataToSign).digest('base64')

      // *** Log the data depending on the debug setting *** \\
      if (this.debug) {
        this.log('Sending HTTP getHost() request.')
      }

      // *** Send the request *** \\
      const res = await this.axios.get(
        'https://api.coolkit.cc:8080/api/user/region',
        {
          headers: {
            Authorization: 'Sign ' + dataToSign,
            'Content-Type': 'application/json'
          },
          params
        }
      )

      // *** Parse the response *** \\
      const body = res.data
      if (!body.region) {
        throw new Error('Server did not respond with a region.\n' + JSON.stringify(body, null, 2))
      }
      switch (body.region) {
        case 'eu':
        case 'us':
        case 'as':
          this.httpHost = body.region + '-apia.coolkit.cc'
          break
        case 'cn':
          this.httpHost = 'cn-apia.coolkit.cn'
          break
        default:
          throw new Error('No valid region received - [' + body.region + '].')
      }
      if (this.debug) {
        this.log('HTTP API host received [%s].', this.httpHost)
      }
    } catch (err) {
      if (this.helpers.hasProperty(err, 'code') && this.helpers.httpRetryCodes.includes(err.code)) {
        // *** Retry if another attempt could be successful *** \\
        this.log.warn('Unable to reach eWeLink. Retrying in 30 seconds.')
        await this.helpers.sleep(30000)
        return await this.getHost()
      } else {
        throw err
      }
    }
  }

  async login () {
    // *** Used to log the user in and obtain the user api key and token *** \\
    if (this.httpHost === undefined) {
      this.httpHost = 'eu-apia.coolkit.cc'
    }
    const data = {
      countryCode: this.cCode,
      password: this.password
    }
    if (this.username.includes('@')) {
      data.email = this.username
    } else {
      data.phoneNumber = this.username
    }

    // *** Log the data depending on the debug setting *** \\
    if (this.debug) {
      this.log('Sending HTTP login() request.')
    }

    // *** Set up the request signature *** \\
    const dataToSign = this.crypto.createHmac('sha256', this.helpers.appSecret).update(JSON.stringify(data)).digest('base64')

    // *** Send the request *** \\
    const res = await this.axios.post(
      'https://' + this.httpHost + '/v2/user/login', data,
      {
        headers: {
          Authorization: 'Sign ' + dataToSign,
          'Content-Type': 'application/json',
          'X-CK-Appid': this.helpers.appId,
          'X-CK-Nonce': Math.random().toString(36).substr(2, 8)
        }
      }
    )

    // *** Parse the response *** \\
    const body = res.data
    if (body.error === 10004 && body.data && body.data.region) {
      // *** In this case the user has been given a different region so retry login *** \\
      const givenRegion = body.data.region
      switch (givenRegion) {
        case 'eu':
        case 'us':
        case 'as':
          this.httpHost = givenRegion + '-apia.coolkit.cc'
          break
        case 'cn':
          this.httpHost = 'cn-apia.coolkit.cn'
          break
        default:
          throw new Error('No valid region received - [' + givenRegion + '].')
      }
      if (this.debug) {
        this.log('New HTTP API host received [%s].', this.httpHost)
      }
      return await this.login()
    } else {
      if (body.data.at) {
        // *** User api key and token received successfully *** \\
        this.aToken = body.data.at
        this.apiKey = body.data.user.apikey
        return {
          aToken: this.aToken,
          apiKey: this.apiKey,
          httpHost: this.httpHost
        }
      } else {
        if (body.error === 500) {
          // *** Retry if another attempt could be successful *** \\
          this.log.warn('An eWeLink error [500] occured. Retrying in 30 seconds.')
          await this.helpers.sleep(30000)
          return await this.login()
        } else {
          throw new Error('No auth token received.\n' + JSON.stringify(body, null, 2))
        }
      }
    }
  }

  async getDevices () {
    // *** Used to get a user's device list *** \\
    try {
      // *** Send the request *** \\
      const res = await this.axios.get(
        'https://' + this.httpHost + '/v2/device/thing',
        {
          headers: {
            Authorization: 'Bearer ' + this.aToken,
            'Content-Type': 'application/json',
            'X-CK-Appid': this.helpers.appId,
            'X-CK-Nonce': Math.random().toString(36).substr(2, 8)
          },
          params: {
            num: 0
          }
        }
      )

      // *** Parse the response *** \\
      const body = res.data
      if (!body.data || body.error !== 0) {
        throw new Error(JSON.stringify(body, null, 2))
      }

      // *** The list also includes scenes so we need to remove them *** \\
      const deviceList = []
      const sensorList = []
      if (body.data.thingList && body.data.thingList.length > 0) {
        body.data.thingList.forEach(d => {
          // *** Check each item is a device and also remove any devices the user has ignored *** \\
          if (d.itemData && d.itemData.extra && d.itemData.extra.uiid && !this.ignoredDevices.includes(d.itemData.deviceid)) {
            // *** Separate the sensors as these need to be set up last *** \\
            if (d.itemData.extra.uiid === 102 || this.helpers.hasProperty(this.obstructSwitches, d.itemData.deviceid)) {
              sensorList.push(d.itemData)
            } else {
              deviceList.push(d.itemData)
            }
          }
        })
      }

      // *** Sensors need to go last as they update garages that need to exist already *** \\
      return deviceList.concat(sensorList)
    } catch (err) {
      if (err.code && this.helpers.httpRetryCodes.includes(err.code)) {
        // *** Retry if another attempt could be successful *** \\
        this.log.warn('Unable to reach eWeLink. Retrying in 30 seconds.')
        await this.helpers.sleep(30000)
        return await this.getDevices()
      } else {
        throw err
      }
    }
  }

  async getDevice (deviceId) {
    // *** Used to get info about a specific device *** \\
    try {
      // *** Send the request *** \\
      const res = await this.axios.post(
        'https://' + this.httpHost + '/v2/device/thing',
        {
          thingList: [{
            itemType: 1,
            id: deviceId
          }]
        },
        {
          headers: {
            Authorization: 'Bearer ' + this.aToken,
            'Content-Type': 'application/json',
            'X-CK-Appid': this.helpers.appId,
            'X-CK-Nonce': Math.random().toString(36).substr(2, 8)
          }
        }
      )

      // *** Parse the response *** \\
      const body = res.data
      if (!body.data || body.error !== 0) {
        throw new Error(JSON.stringify(body, null, 2))
      }
      if (body.data.thingList && body.data.thingList.length === 1) {
        // *** Return the device data *** \\
        return body.data.thingList[0].itemData
      } else {
        throw new Error('device not found in eWeLink')
      }
    } catch (err) {
      if (err.code && this.helpers.httpRetryCodes.includes(err.code)) {
        // *** Retry if another attempt could be successful *** \\
        this.log.warn('Unable to reach eWeLink. Retrying in 30 seconds.')
        await this.helpers.sleep(30000)
        return await this.getDevice(deviceId)
      } else {
        throw err
      }
    }
  }
}
