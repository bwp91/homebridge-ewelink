/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

class FakeGatoTimer {
  constructor (log) {
    this.log = log
    this.subscribedServices = []
  }

  subscribe (service, callback) {
    this.log('[%s] fakegato subscribe().', service.accessory.displayName)
    const newService = {
      service,
      callback,
      backLog: [],
      previousBackLog: [],
      previousAvrg: {}
    }
    this.subscribedServices.push(newService)
  }

  unsubscribe (service) {
    const index = this.subscribedServices.findIndex(ele => ele.service === service)
    this.subscribedServices.splice(index, 1)
    if (this.subscribedServices.length === 0 && this.running) {
      this.stop()
    }
  }

  start () {
    this.log('Fakegato global timer STARTED [10 mins].')
    if (this.running) {
      this.stop()
    }
    this.running = true
    this.intervalID = setInterval(this.executeCallbacks.bind(this), 600000)
  }

  stop () {
    this.log('Fakegato global timer STOPPED.')
    clearInterval(this.intervalID)
    this.running = false
    this.intervalID = null
  }

  executeCallbacks () {
    if (this.subscribedServices.length !== 0) {
      for (const s in this.subscribedServices) {
        if (Object.prototype.hasOwnProperty.call(this.subscribedServices, s)) {
          const service = this.subscribedServices[s]
          if (typeof (service.callback) === 'function') {
            service.previousAvrg = service.callback({
              backLog: service.backLog,
              previousAvrg: service.previousAvrg,
              timer: this,
              immediate: false
            })
          }
        }
      }
    }
  }

  executeImmediateCallback (service) {
    if (typeof (service.callback) === 'function' && service.backLog.length) {
      service.callback({
        backLog: service.backLog,
        timer: this,
        immediate: true
      })
    }
  }

  addData (params) {
    const data = params.entry
    const service = params.service
    const immediateCallback = params.immediateCallback || false
    this.log('[%s] fakegato addData [%s].', service.accessory.displayName, data)
    if (immediateCallback) {
      // door or motion -> replace
      this.subscribedServices.find(ele => ele.service === service).backLog[0] = data
    } else {
      this.subscribedServices.find(ele => ele.service === service).backLog.push(data)
    }
    if (immediateCallback) {
      this.executeImmediateCallback(this.subscribedServices.find(ele => ele.service === service))
    }
    if (!this.running) {
      this.start()
    }
  }

  emptyData (service) {
    this.log('[%s] fakegato emptyData().', service.accessory.displayName)
    const source = this.subscribedServices.find(ele => ele.service === service)
    if (source.backLog.length) {
      source.previousBackLog = source.backLog
    }
    source.backLog = []
  }
}

module.exports = { FakeGatoTimer }
