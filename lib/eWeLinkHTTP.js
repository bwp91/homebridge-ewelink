'use strict'
const axios = require('axios')
const constants = require('./constants')
const crypto = require('crypto')
const utils = require('./utils')
module.exports = class eWeLinkHTTP {
  constructor (config, log) {
    this.log = log
    this.debug = config.debug || false
    this.debugReqRes = config.debugReqRes || false
    this.username = config.username.toString()
    this.password = config.password.toString()
    this.hideDevFromHB = (config.hideDevFromHB || '').toString()
    this.cCode =
      '+' + config.countryCode.toString().replace('+', '').replace(' ', '')
  }

  async getHost () {
    const params = {
      appid: constants.appId,
      country_code: this.cCode,
      nonce: Math.random().toString(36).substr(2, 8),
      ts: Math.floor(new Date().getTime() / 1000),
      version: 8
    }
    let dataToSign = []
    try {
      Object.keys(params).forEach((k) => {
        dataToSign.push({
          key: k,
          value: params.k
        })
      })
      dataToSign.sort((a, b) => (a.key < b.key ? -1 : 1))
      dataToSign = dataToSign.map((k) => k.key + '=' + k.value).join('&')
      dataToSign = crypto
        .createHmac('sha256', constants.appSecret)
        .update(dataToSign)
        .digest('base64')
      if (this.debugReqRes) {
        this.log.warn(
          'Sending HTTP getHost request. This text is yellow for clarity.\n%s',
          JSON.stringify(params, null, 2)
        )
      } else if (this.debug) {
        this.log('Sending HTTP getHost request.')
      }
      const res = await axios.get(
        'https://api.coolkit.cc:8080/api/user/region', {
          headers: {
            Authorization: 'Sign ' + dataToSign,
            'Content-Type': 'application/json'
          },
          params
        }
      )
      const body = res.data
      if (!body.region) {
        throw new Error(
          'Server did not respond with a region.\n' +
          JSON.stringify(body, null, 2)
        )
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
      if (
        Object.prototype.hasOwnProperty.call(err, 'code') && ['ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN'].includes(err.code)
      ) {
        this.log.warn('Unable to reach eWeLink. Retrying in 30 seconds.')
        await utils.sleep(30000)
        return this.getHost()
      } else {
        throw err
      }
    }
  }

  async login () {
    const data = {
      countryCode: this.cCode,
      password: this.password
    }
    this.username.includes('@')
      ? (data.email = this.username)
      : (data.phoneNumber = this.username)
    if (this.debugReqRes) {
      const msg = JSON.stringify(data, null, 2)
        .replace(this.password, '**hidden**')
        .replace(this.username, '**hidden**')
      this.log.warn(
        'Sending HTTP login request. This text is yellow for clarity.\n%s',
        msg
      )
    } else if (this.debug) {
      this.log('Sending HTTP login request.')
    }
    const dataToSign = crypto
      .createHmac('sha256', constants.appSecret)
      .update(JSON.stringify(data))
      .digest('base64')
    const res = await axios.post(
      'https://' + this.httpHost + '/v2/user/login',
      data, {
        headers: {
          Authorization: 'Sign ' + dataToSign,
          'Content-Type': 'application/json',
          Host: this.httpHost,
          'X-CK-Appid': constants.appId,
          'X-CK-Nonce': Math.random().toString(36).substr(2, 8)
        }
      }
    )
    const body = res.data
    if (
      Object.prototype.hasOwnProperty.call(body, 'error') &&
      body.error === 10004 &&
      Object.prototype.hasOwnProperty.call(body, 'data') &&
      Object.prototype.hasOwnProperty.call(body.data, 'region')
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
      return this.login()
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
        this.log.warn(
          'An eWeLink error [500] occured. Retrying in 30 seconds.'
        )
        await utils.sleep(30000)
        return this.login()
      } else {
        throw new Error('No auth token received.\n' + JSON.stringify(body, null, 2))
      }
    }
  }

  async getDevices () {
    try {
      const res = await axios.get(
        'https://' + this.httpHost + '/v2/device/thing', {
          headers: {
            Authorization: 'Bearer ' + this.aToken,
            'Content-Type': 'application/json',
            Host: this.httpHost,
            'X-CK-Appid': constants.appId,
            'X-CK-Nonce': Math.random().toString(36).substr(2, 8)
          }
        }
      )
      const body = res.data
      if (
        !Object.prototype.hasOwnProperty.call(body, 'data') ||
        !Object.prototype.hasOwnProperty.call(body, 'error') ||
        (Object.prototype.hasOwnProperty.call(body, 'error') && body.error !== 0)
      ) {
        throw new Error(JSON.stringify(body, null, 2))
      }
      const deviceList = []
      if (body.data.thingList && body.data.thingList.length > 0) {
        body.data.thingList.forEach((device) =>
          deviceList.push(device.itemData)
        )
      }
      deviceList
        .filter(
          (d) => Object.prototype.hasOwnProperty.call(d, 'extra') && Object.prototype.hasOwnProperty.call(d.extra, 'uiid')
        )
        .filter((d) => !this.hideDevFromHB.includes(d.deviceid))
      return deviceList
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

  async getDevice (deviceId) {
    try {
      const res = await axios.post(
        'https://' + this.httpHost + '/v2/device/thing', {
          thingList: [{
            itemType: 1,
            id: deviceId
          }]
        }, {
          headers: {
            Authorization: 'Bearer ' + this.aToken,
            'Content-Type': 'application/json',
            Host: this.httpHost,
            'X-CK-Appid': constants.appId,
            'X-CK-Nonce': Math.random().toString(36).substr(2, 8)
          }
        }
      )
      const body = res.data
      if (
        !Object.prototype.hasOwnProperty.call(body, 'data') ||
        !Object.prototype.hasOwnProperty.call(body, 'error') ||
        (Object.prototype.hasOwnProperty.call(body, 'error') && body.error !== 0)
      ) {
        throw new Error(JSON.stringify(body, null, 2))
      }
      if (body.data.thingList && body.data.thingList.length === 1) {
        return body.data.thingList[0].itemData
      } else {
        throw new Error('device not found in eWeLink')
      }
    } catch (err) {
      if (
        Object.prototype.hasOwnProperty.call(err, 'code') && ['ENOTFOUND', 'ETIMEDOUT'].includes(err.code)
      ) {
        this.log.warn('Unable to reach eWeLink. Retrying in 30 seconds.')
        await utils.sleep(30000)
        return this.getDevice(deviceId)
      } else {
        throw err
      }
    }
  }
}
