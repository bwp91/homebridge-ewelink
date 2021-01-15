/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const hostname = os.hostname().split('.')[0]

class FakeGatoStorage {
  constructor (log) {
    this.log = log
    this.writers = []
  }

  addWriter (service, params) {
    if (this.addingWriter) {
      setTimeout(() => this.addWriter(service, params), 100)
      return
    }
    this.addingWriter = true
    this.log('[%s] fakegato addWriter().', service.accessory.displayName)
    const newWriter = {
      service,
      fileName: hostname + '_' + service.accessory.displayName + '_persist.json'
    }
    const onReady = params.onReady
    newWriter.storageHandler = fs
    newWriter.path = params.path
    this.writers.push(newWriter)
    this.addingWriter = false
    onReady()
  }

  write (params) {
    if (this.writing) {
      setTimeout(() => this.write(params), 100)
      return
    }
    this.writing = true
    const writer = this.writers.find(ele => ele.service === params.service)
    this.log('[%s] fakegato write [%s].', params.service.accessory.displayName, params.data.substr(1, 80))
    writer.storageHandler.writeFile(path.join(writer.path, writer.fileName), params.data, 'utf8', () => {
      this.writing = false
    })
  }

  read (params) {
    const writer = this.writers.find(ele => ele.service === params.service)
    this.log('[%s] fakegato read [%s].', params.service.accessory.displayName, path.join(writer.path, writer.fileName))
    writer.storageHandler.readFile(path.join(writer.path, writer.fileName), 'utf8', params.callback)
  }

  remove (params) {
    const writer = this.writers.find(ele => ele.service === params.service)
    this.log('[%s] fakegato delete [%s].', params.service.accessory.displayName, path.join(writer.path, writer.fileName))
    writer.storageHandler.unlink(path.join(writer.path, writer.fileName), 'utf8', () => {})
  }
}

module.exports = { FakeGatoStorage }
