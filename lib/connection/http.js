/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class connectionHTTP {
  constructor (platform) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.funcs = platform.funcs
    this.log = platform.log
    this.messages = platform.messages
    this.obstructSwitches = platform.obstructSwitches

    // Set up config variables from the platform
    this.debug = platform.config.debug
    this.ignoredDevices = platform.config.ignoredDevices
    this.password = platform.config.password
    this.username = platform.config.username

    // Set up libraries from the platform
    this.axios = platform.axios
    this.crypto = platform.crypto

    // Try a default http host which will be changed for other regions automatically
    this.httpHost = 'eu-apia.coolkit.cc'
  }

  async login () {
    // Used to log the user in and obtain the user api key and token
    const data = {
      countryCode: '+44',
      password: this.password
    }

    // See if the user has provided an email or phone as username
    if (this.username.includes('@')) {
      data.email = this.username
    } else {
      data.phoneNumber = this.username
    }

    // Log the data depending on the debug setting
    if (this.debug) {
      this.log('%s.', this.messages.sendLogin)
    }

    // Set up the request signature
    const dataToSign = this.crypto.createHmac('sha256', this.consts.appSecret)
      .update(JSON.stringify(data)).digest('base64')

    // Send the request
    const res = await this.axios.post(
      'https://' + this.httpHost + '/v2/user/login', data,
      {
        headers: {
          Authorization: 'Sign ' + dataToSign,
          'Content-Type': 'application/json',
          'X-CK-Appid': this.consts.appId,
          'X-CK-Nonce': Math.random().toString(36).substr(2, 8)
        }
      }
    )

    // Parse the response
    const body = res.data
    if (body.error === 10004 && body.data && body.data.region) {
      // In this case the user has been given a different region so retry login
      const givenRegion = body.data.region

      // Check the new received region is valid
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
          throw new Error(this.messages.noRegionRec + ' - [' + givenRegion + '].')
      }

      // Log the new http host if appropriate
      if (this.debug) {
        this.log('%s [%s].', this.messages.newRegionRec, this.httpHost)
      }

      // Retry the login with the new http host
      return await this.login()
    } else {
      if (body.data.at) {
        // User api key and token received successfully
        this.aToken = body.data.at
        this.apiKey = body.data.user.apikey
        return {
          aToken: this.aToken,
          apiKey: this.apiKey,
          httpHost: this.httpHost
        }
      } else {
        if (body.error === 500) {
          // Retry if another attempt could be successful
          this.log.warn('%s.', this.messages.eweError)
          await this.funcs.sleep(30000)
          return await this.login()
        } else {
          throw new Error(this.messages.noAuthRec + '.\n' + JSON.stringify(body, null, 2))
        }
      }
    }
  }

  async getDevices () {
    // Used to get a user's device list
    try {
      // Send the request
      const res = await this.axios.get('https://' + this.httpHost + '/v2/device/thing', {
        headers: {
          Authorization: 'Bearer ' + this.aToken,
          'Content-Type': 'application/json',
          'X-CK-Appid': this.consts.appId,
          'X-CK-Nonce': Math.random().toString(36).substr(2, 8)
        },
        params: {
          num: 0
        }
      })

      // Parse the response
      const body = res.data
      if (!body.data || body.error !== 0) {
        throw new Error(JSON.stringify(body, null, 2))
      }

      // The list also includes scenes so we need to remove them
      const deviceList = []
      const sensorList = []
      if (body.data.thingList && body.data.thingList.length > 0) {
        body.data.thingList.forEach(d => {
          // Check each item is a device and also remove any devices the user has ignored
          if (
            d.itemData &&
            d.itemData.extra &&
            d.itemData.extra.uiid &&
            !this.ignoredDevices.includes(d.itemData.deviceid)
          ) {
            // Separate the sensors as these need to be set up last
            const isObstructSwitch = this.obstructSwitches[d.itemData.deviceid]
            if (d.itemData.extra.uiid === 102 || isObstructSwitch) {
              sensorList.push(d.itemData)
            } else {
              deviceList.push(d.itemData)
            }
          }
        })
      }

      // Sensors need to go last as they update garages that need to exist already
      return deviceList.concat(sensorList)
    } catch (err) {
      // Check to see if it's a eWeLink server problem and we can retry
      if (err.code && this.consts.httpRetryCodes.includes(err.code)) {
        // Retry if another attempt could be successful
        this.log.warn('%s (%s - 1).', this.messages.httpRetry, err.code)
        await this.funcs.sleep(30000)
        return await this.getDevices()
      } else {
        // It's not a eWeLink problem so report the error back
        this.log.warn('An error occurred during getDevices().')
        throw err
      }
    }
  }

  async getDevice (deviceId) {
    // Used to get info about a specific device
    try {
      // Send the request
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
            'X-CK-Appid': this.consts.appId,
            'X-CK-Nonce': Math.random().toString(36).substr(2, 8)
          }
        }
      )

      // Parse the response
      const body = res.data
      if (!body.data || body.error !== 0) {
        throw new Error(JSON.stringify(body, null, 2))
      }
      if (body.data.thingList && body.data.thingList.length === 1) {
        // Return the device data
        return body.data.thingList[0].itemData
      } else {
        throw new Error(this.messages.devNotFound)
      }
    } catch (err) {
      if (err.code && this.consts.httpRetryCodes.includes(err.code)) {
        // Retry if another attempt could be successful
        this.log.warn('%s (%s - 2).', this.messages.httpRetry, err.code)
        await this.funcs.sleep(30000)
        return await this.getDevice(deviceId)
      } else {
        // It's not a eWeLink problem so report the error back
        this.log.warn('An error occurred during getDevice().')
        throw err
      }
    }
  }
}
