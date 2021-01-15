/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

const fs = require('fs')
const os = require('os')
const path = require('path')
const hostname = os.hostname().split('.')[0]
const fileSuffix = '_persist.json'

class FakeGatoStorage {
  constructor (params) {
    this.writers = []
    this.log = params.log
    this.addingWriter = false
  }

  addWriter (service, params) {
    if (!this.addingWriter) {
      this.addingWriter = true
      this.log('[%s] fakegato storage - addWriter', service.accessoryName)
      const newWriter = {
        service,
        callback: params.callback,
        storage: params.storage || 'fs',
        fileName: params.filename || hostname + '_' + service.accessoryName + fileSuffix
      }
      const onReady = params.onReady
      newWriter.storageHandler = fs
      newWriter.path = params.path
      this.writers.push(newWriter)
      this.addingWriter = false
      onReady()
    } else {
      setTimeout(() => this.addWriter(service, params), 100)
    }
  }

  getWriter (service) {
    const findServ = function (element) {
      return element.service === service
    }
    return this.writers.find(findServ)
  }

  _getWriterIndex (service) {
    const findServ = function (element) {
      return element.service === service
    }
    return this.writers.findIndex(findServ)
  }

  getWriters () {
    return this.writers
  }

  delWriter (service) {
    const index = this._getWriterIndex(service)
    this.writers.splice(index, 1)
  }

  write (params) {
    // *** Must be asynchronous *** \\
    if (!this.writing) {
      this.writing = true
      const writer = this.getWriter(params.service)
      const callBack = typeof (params.callback) === 'function'
        ? params.callback
        : typeof (writer.callback) === 'function'
          ? writer.callback
          : function () { }
      this.log('Fakegato storage - write file: %s.', path.join(writer.path, writer.fileName), params.data.substr(1, 80))
      writer.storageHandler.writeFile(path.join(writer.path, writer.fileName), params.data, 'utf8', () => {
        this.writing = false
        callBack(arguments)
      })
    } else {
      setTimeout(() => this.write(params), 100)
    }
  }

  read (params) {
    const writer = this.getWriter(params.service)
    const callBack = typeof (params.callback) === 'function'
      ? params.callback
      : typeof (writer.callback) === 'function'
        ? writer.callback
        : function () { }
    this.log('Fakegato storage read file: %s.', path.join(writer.path, writer.fileName))
    writer.storageHandler.readFile(path.join(writer.path, writer.fileName), 'utf8', callBack)
  }

  remove (params) {
    const writer = this.getWriter(params.service)
    const callBack = typeof (params.callback) === 'function'
      ? params.callback
      : typeof (writer.callback) === 'function'
        ? writer.callback
        : function () { }
    this.log('Fakegato storage delete file: %s.', path.join(writer.path, writer.fileName))
    writer.storageHandler.unlink(path.join(writer.path, writer.fileName), callBack)
  }
}

module.exports = { FakeGatoStorage }
