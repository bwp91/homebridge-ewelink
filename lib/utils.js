'use strict'
module.exports = {
  sleep: ms => {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
