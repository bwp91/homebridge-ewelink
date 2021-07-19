/* jshint node: true,esversion: 9, -W014, -W033 */
/* eslint-disable new-cap */
'use strict'

module.exports = {
  hasProperty: (obj, prop) => {
    return Object.prototype.hasOwnProperty.call(obj, prop)
  },

  sleep: ms => {
    return new Promise(resolve => setTimeout(resolve, ms))
  },

  parseDeviceId: deviceId => {
    return deviceId
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '')
      .replace('sw', 'SW')
  },

  parseError: (err, hideStack = []) => {
    let toReturn = err.message
    if (err.stack && err.stack.length > 0 && !hideStack.includes(err.message)) {
      const stack = err.stack.split('\n')
      if (stack[1]) {
        toReturn += stack[1].replace('   ', '')
      }
    }
    return toReturn
  }
}
