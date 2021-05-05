/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class connectionAPI {
  constructor (platform, devicesInHB) {
    // Set up variables from the platform
    this.consts = platform.consts
    this.debug = platform.config.debug
    this.devicesInHB = devicesInHB
    this.funcs = platform.funcs
    this.hapChar = platform.api.hap.Characteristic
    this.hapServ = platform.api.hap.Service
    this.hapUUIDGen = platform.api.hap.uuid.generate
    this.lang = platform.lang
    this.log = platform.log
    this.lastDate = new Date()
  }

  action (url) {
    const nowDate = new Date()
    if ((nowDate - this.lastDate) / 1000 < 1) {
      throw new Error('Requested too soon')
    }
    this.lastDate = nowDate
    const pathParts = url.split('/')
    const device = pathParts[1]
    const action = pathParts[2]
    const attribute = pathParts[3]
    const newStatus = pathParts[4]
    if (!device) {
      throw new Error('No accessory specified')
    }
    const uuid = this.hapUUIDGen(device)
    if (!this.devicesInHB.has(uuid)) {
      throw new Error('Accessory not found in Homebridge')
    }
    if (!action) {
      throw new Error('No action specified')
    }
    if (!['get', 'set'].includes(action)) {
      throw new Error("Action must be 'get' or 'set'")
    }
    if (!attribute) {
      throw new Error('No attribute specified')
    }
    if (!['state'].includes(attribute)) {
      throw new Error("Action must be 'state'")
    }
    if (action === 'set') {
      if (!newStatus) {
        throw new Error('No new status specified')
      }
      if (!['on', 'off', 'toggle'].includes(newStatus)) {
        throw new Error("New status must be 'on', 'off' or 'toggle' for attribute:state")
      }
    }
    const accessory = this.devicesInHB.get(uuid)
    const service = accessory.getService(this.hapServ.Switch) ||
      accessory.getService(this.hapServ.Outlet) ||
      accessory.getService(this.hapServ.Lightbulb)

    if (!service) {
      throw new Error("Accessory is not 'Switch', 'Outlet' or 'Lightbulb'")
    }

    const currentHKStatus = service.getCharacteristic(this.hapChar.On).value

    if (action === 'get') {
      return currentHKStatus ? 'on' : 'off'
    }

    if (action === 'set') {
      let newHKStatus
      switch (newStatus) {
        case 'on':
          newHKStatus = true
          break
        case 'off':
          newHKStatus = false
          break
        case 'toggle':
          newHKStatus = !currentHKStatus
          break
      }
      service.setCharacteristic(this.hapChar.On, newHKStatus)
    }
  }
}
