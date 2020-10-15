/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
const axios = require('axios')
const crypto = require('crypto')
const helpers = require('./helpers')
module.exports = class eWeLinkHTTP {
  constructor (config, log) {
    this.log = log
    this.debug = config.debug || false
    this.debugReqRes = config.debugReqRes || false
    this.username = config.username.toString()
    this.password = config.password.toString()
    this.hideDevFromHB = (config.hideDevFromHB || '').toString()
    this.cCode = '+' + config.countryCode.toString().replace('+', '').replace(' ', '')
  }

  async getHost () {
    const params = {
      appid: helpers.appId,
      country_code: this.cCode,
      nonce: Math.random().toString(36).substr(2, 8),
      ts: Math.floor(new Date().getTime() / 1000),
      version: 8
    }
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
      dataToSign = crypto.createHmac('sha256', helpers.appSecret).update(dataToSign).digest('base64')
      if (this.debugReqRes) {
        this.log.warn('Sending HTTP getHost() request. This text is yellow for clarity.\n%s', JSON.stringify(params, null, 2))
      } else if (this.debug) {
        this.log('Sending HTTP getHost() request.')
      }
      const res = await axios.get('https://api.coolkit.cc:8080/api/user/region', {
        headers: {
          Authorization: 'Sign ' + dataToSign,
          'Content-Type': 'application/json'
        },
        params
      })
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
      return this.httpHost
    } catch (err) {
      if (helpers.hasProperty(err, 'code') && helpers.httpRetryCodes.includes(err.code)) {
        if (this.debug) {
          this.log.warn('Unable to reach eWeLink. Retrying in 30 seconds.')
        }
        await helpers.sleep(30000)
        return await this.getHost()
      } else {
        return err
      }
    }
  }

  async login () {
    const data = {
      countryCode: this.cCode,
      password: this.password
    }
    if (this.username.includes('@')) {
      data.email = this.username
    } else {
      data.phoneNumber = this.username
    }
    if (this.debugReqRes) {
      const msg = JSON.stringify(data, null, 2).replace(this.password, '**hidden**').replace(this.username, '**hidden**')
      this.log.warn('Sending HTTP login() request. This text is yellow for clarity.\n%s', msg)
    } else if (this.debug) {
      this.log('Sending HTTP login() request.')
    }
    const dataToSign = crypto.createHmac('sha256', helpers.appSecret).update(JSON.stringify(data)).digest('base64')
    const res = await axios.post('https://' + this.httpHost + '/v2/user/login', data, {
      headers: {
        Authorization: 'Sign ' + dataToSign,
        'Content-Type': 'application/json',
        Host: this.httpHost,
        'X-CK-Appid': helpers.appId,
        'X-CK-Nonce': Math.random().toString(36).substr(2, 8)
      }
    })
    const body = res.data
    if (
      helpers.hasProperty(body, 'error') &&
      body.error === 10004 &&
      helpers.hasProperty(body, 'data') &&
      helpers.hasProperty(body.data, 'region')
    ) {
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
    }
    if (body.data.at) {
      this.aToken = body.data.at
      this.apiKey = body.data.user.apikey
      return {
        aToken: this.aToken,
        apiKey: this.apiKey,
        httpHost: this.httpHost
      }
    } else {
      if (body.error === 500) {
        if (this.debug) {
          this.log.warn('An eWeLink error [500] occured. Retrying in 30 seconds.')
        }
        await helpers.sleep(30000)
        return await this.login()
      } else {
        throw new Error('No auth token received.\n' + JSON.stringify(body, null, 2))
      }
    }
  }

  async getDevices () {
    try {
      const res = await axios.get('https://' + this.httpHost + '/v2/device/thing', {
        headers: {
          Authorization: 'Bearer ' + this.aToken,
          'Content-Type': 'application/json',
          Host: this.httpHost,
          'X-CK-Appid': helpers.appId,
          'X-CK-Nonce': Math.random().toString(36).substr(2, 8)
        }
      })
      const body = res.data
      if (
        !helpers.hasProperty(body, 'data') ||
        !helpers.hasProperty(body, 'error') ||
        (helpers.hasProperty(body, 'error') && body.error !== 0)
      ) {
        throw new Error(JSON.stringify(body, null, 2))
      }
      const deviceList = []
      if (body.data.thingList && body.data.thingList.length > 0) {
        body.data.thingList.forEach(d => {
          if (
            helpers.hasProperty(d, 'itemData') &&
            helpers.hasProperty(d.itemData, 'extra') &&
            helpers.hasProperty(d.itemData.extra, 'uiid') &&
            !this.hideDevFromHB.includes(d.itemData.deviceid)
          ) {
            deviceList.push(d.itemData)
          }
        })
      }
      return deviceList
    } catch (err) {
      if (helpers.hasProperty(err, 'code') && helpers.httpRetryCodes.includes(err.code)) {
        if (this.debug) {
          this.log.warn('Unable to reach eWeLink. Retrying in 30 seconds.')
        }
        await helpers.sleep(30000)
        return await this.getDevices()
      } else {
        return err
      }
    }
  }

  async getDevice (deviceId) {
    try {
      const res = await axios.post('https://' + this.httpHost + '/v2/device/thing', {
        thingList: [{
          itemType: 1,
          id: deviceId
        }]
      }, {
        headers: {
          Authorization: 'Bearer ' + this.aToken,
          'Content-Type': 'application/json',
          Host: this.httpHost,
          'X-CK-Appid': helpers.appId,
          'X-CK-Nonce': Math.random().toString(36).substr(2, 8)
        }
      })
      const body = res.data
      if (
        !helpers.hasProperty(body, 'data') ||
        !helpers.hasProperty(body, 'error') ||
        (helpers.hasProperty(body, 'error') && body.error !== 0)
      ) {
        throw new Error(JSON.stringify(body, null, 2))
      }
      if (body.data.thingList && body.data.thingList.length === 1) {
        return body.data.thingList[0].itemData
      } else {
        throw new Error('device not found in eWeLink')
      }
    } catch (err) {
      if (helpers.hasProperty(err, 'code') && helpers.httpRetryCodes.includes(err.code)) {
        if (this.debug) {
          this.log.warn('Unable to reach eWeLink. Retrying in 30 seconds.')
        }
        await helpers.sleep(30000)
        return await this.getDevice(deviceId)
      } else {
        return err
      }
    }
  }
}
