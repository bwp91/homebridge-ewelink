/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = class connectionAPI {
  constructor (platform, devicesInHB) {
    // Set up variables from the platform
    this.config = platform.config
    this.consts = platform.consts
    this.debug = platform.config.debug
    this.devicesInHB = devicesInHB
    this.funcs = platform.funcs
    this.hapChar = platform.api.hap.Characteristic
    this.hapServ = platform.api.hap.Service
    this.hapUUIDGen = platform.api.hap.uuid.generate
    this.lang = platform.lang
    this.log = platform.log
  }

  showHome () {
    // Return the home page for the API
    return `<!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.0.0-beta3/dist/css/bootstrap.min.css" rel="stylesheet" integrity="sha384-eOJMYsd53ii+scO/bJGFsiCZc+5NDVN2yr8+0RDqr0Ql0h+rP48ckxlpbzKgwra6" crossorigin="anonymous">
        <title>homebridge-ewelink API Docs</title>
        <script src="https://kit.fontawesome.com/7b8907c984.js" crossorigin="anonymous"></script>
      </head>
      <body>
        <div class="container-fluid my-3">
          <div class="row content">
            <div class="col-lg-2"></div>
            <div class="col-lg-8">
              <p class="text-center">
                <img src="https://user-images.githubusercontent.com/43026681/101325266-63126600-3863-11eb-9382-4a2924f0e540.png" alt="homebridge-ewelink logo" style="width: 60%;">
                <h4 class="text-center">homebridge-ewelink</h3>
              </p>
              <hr class="mb-0">
              <h5 class="mt-4 mb-2">API Docs</h5>
              <ul class="small">
                <li>All requests are of type <code>GET</code></li>
                <li>All requests must include a HTTP authentication header in the form:
                  <ul>
                    <li><code>Authorization: "Basic %%%"</code></li>
                    <li>Where <code>%%%</code> is a base64 encoded string of your eWeLink username and password in the form <code>username:password</code></li>
                  </ul>
                </li>
                <li>All requests will return a <code>HTTP 200 OK</code> success code</li>
                <li>All requests will return a JSON response</li>
                <li>Success or failure of any request can be determined by the <code>success</code> response property which will be <code>true</code> or <code>false</code></li>
                <li>Any error will be returned in an <code>error</code> parameter as a <code>string</code></li>
                <li>Replace <code>{hbDeviceId}</code> with the Homebridge ID of the device, e.g. <code>10000abcdeSWX</code></li>
                <li>Supported devices are currently:
                  <ul>
                    <li>Switches</li>
                    <li>Outlets</li>
                    <li>Lights</li>
                    <li>Temperature Sensors</li>
                    <li>Humidity Sensors</li>
                  </ul>
                </li>
                <li>A note about offline devices:
                  <ul>
                    <li>Querying any attribute will return the HomeKit cache value</li>
                    <li>Updating an attribute which matches the HomeKit cache value will return a <code>success:true</code> response</li>
                    <li>Updating an attribute which does not match the HomeKit cache value will return a <code>success:false</code> with an <code>error:"HAP Status Error: -70402"</code> response</li>
                  </ul>
                </li>
              </ul>
              <h5 class="mt-4 mb-2">Accessory Query Commands</h5>
              <div class="table-responsive">
              <table class="table table-sm table-hover">
                <thead>
                  <tr>
                    <th scope="col" class="small" style="width: 50%;">Function</th>
                    <th scope="col" class="small" style="width: 50%;">Path</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="small">
                      Obtain a device list as an array.<br>
                      Example response:<br>
                      <code>{"success":true,"response":[]}</code>
                    </td>
                    <td class="align-middle small"><code>/get/devicelist</code></td>
                  </tr>
                  <tr>
                    <td class="small">
                      Query the <code>online</code>/<code>offline</code> cloud (WAN) state.<br>
                      Example response:<br>
                      <code>{"success":true,"response":"online"}</code>
                    </td>
                    <td class="align-middle small"><code>/get/{hbDeviceId}/statuswan</code></td>
                  </tr>
                  <tr>
                    <td class="small">
                      Query the <code>online</code>/<code>offline</code> local (LAN) state.<br>
                      Example response:<br>
                      <code>{"success":true,"response":"offline"}</code>
                    </td>
                    <td class="align-middle small"><code>/get/{hbDeviceId}/statuslan</code></td>
                  </tr>
                  <tr>
                    <td class="small">
                      Query the <code>on</code>/<code>off</code> state.<br>
                      Example response:<br>
                      <code>{"success":true,"response":"on"}</code>
                    </td>
                    <td class="align-middle small"><code>/get/{hbDeviceId}/state</code></td>
                  </tr>
                  <tr>
                    <td class="small">
                      Query the brightness between <code>0</code>% and <code>100</code>%.<br>
                      Example response:<br>
                      <code>{"success":true,"response":34}</code>
                    </td>
                    <td class="align-middle small"><code>/get/{hbDeviceId}/brightness</code></td>
                  </tr>
                  <tr>
                    <td class="small">
                      Query the hue between <code>0</code>° and <code>360</code>°.<br>
                      Example response:<br>
                      <code>{"success":true,"response":17}</code>
                    </td>
                    <td class="align-middle small"><code>/get/{hbDeviceId}/hue</code></td>
                  </tr>
                  <tr>
                    <td class="small">
                      Query the colour temperature between <code>140</code> and <code>500</code> mired.<br>
                      Example response:<br>
                      <code>{"success":true,"response":345}</code>
                    </td>
                    <td class="align-middle small"><code>/get/{hbDeviceId}/colourtemperature</code></td>
                  </tr>
                  <tr>
                    <td class="small">
                      Query the Adaptive Lighting <code>on</code>/<code>off</code> state.<br>
                      Example response:<br>
                      <code>{"success":true,"response":"on"}</code>
                    </td>
                    <td class="align-middle small"><code>/get/{hbDeviceId}/adaptivelighting</code></td>
                  </tr>
                  <tr>
                    <td class="small">
                      Query the temperature as °C.<br>
                      Example response:<br>
                      <code>{"success":true,"response":16.3}</code>
                    </td>
                    <td class="align-middle small"><code>/get/{hbDeviceId}/temperature</code></td>
                  </tr>
                  <tr>
                    <td class="small">
                      Query the humidity a %.<br>
                      Example response:<br>
                      <code>{"success":true,"response":54}</code>
                    </td>
                    <td class="align-middle small"><code>/get/{hbDeviceId}/humidity</code></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <h5 class="mt-4 mb-2">Accessory Control Commands</h5>
            <div class="table-responsive">
              <table class="table table-sm table-hover">
                <thead>
                  <tr>
                    <th scope="col" class="small" style="width: 50%;">Function</th>
                    <th scope="col" class="small" style="width: 50%;">Path</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td class="small">
                      Set the state to <code>on</code>.<br>
                      Command range:<br>
                      Must be <code>on</code>.
                    </td>
                    <td class="align-middle small"><code>/set/{hbDeviceId}/state/on</code></td>
                  </tr>
                  <tr>
                    <td class="small">
                      Set the state to <code>off</code>.<br>
                      Command range:<br>
                      Must be <code>off</code>.
                    </td>
                    <td class="align-middle small"><code>/set/{hbDeviceId}/state/off</code></td>
                  </tr>
                  <tr>
                    <td class="small">
                      Switch (<code>toggle</code>) the current state.<br>
                      Command range:<br>
                      Must be <code>toggle</code>.
                    </td>
                    <td class="align-middle small"><code>/set/{hbDeviceId}/state/toggle</code></td>
                  </tr>
                  <tr>
                    <td class="small">
                      Set the to <code>54</code>%.<br>
                      Command range:<br>
                      Must be between <code>0</code> and <code>100</code>.
                    </td>
                    <td class="align-middle small"><code>/set/{hbDeviceId}/brightness/54</code></td>
                  </tr>
                  <tr>
                    <td class="small">
                      Set the hue to <code>157</code>°.<br>
                      Command range:<br>
                      Must be between <code>0</code> and <code>360</code>.
                    </td>
                    <td class="align-middle small"><code>/set/{hbDeviceId}/hue/157</code></td>
                  </tr>
                  <tr>
                    <td class="small">
                      Set the colour temperature to <code>300</code> mired.<br>
                      Command range:<br>
                      Must be between <code>140</code> and <code>500</code>.
                    </td>
                    <td class="align-middle small"><code>/set/{hbDeviceId}/colourtemperature/300</code></td>
                  </tr>
                </tbody>
              </table>
              </div>
            </div>
            <div class="col-lg-2"></div>
          </div>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.0.0-beta3/dist/js/bootstrap.bundle.min.js" integrity="sha384-JEW9xMcG8R+pH31jmWH6WWP0WintQrMb4s7ZOdauHnUtxwoG2vI5DkLtS3qm9Ekf" crossorigin="anonymous"></script>
      </body>
    </html>`
  }

  async action (req) {
    // Authenticate the request
    if (
      !req.headers ||
      !req.headers.authorization ||
      req.headers.authorization.indexOf('Basic ') === -1
    ) {
      throw new Error('Invalid authentication')
    }
    const encodedCreds = req.headers.authorization.split(' ')[1]
    const buff = Buffer.from(encodedCreds, 'base64')
    const decodedCreds = buff.toString('utf8').replace(/(\r\n|\n|\r)/gm, '').trim()
    const [user, pass] = decodedCreds.split(':')
    if (user !== this.config.username || pass !== this.config.password) {
      throw new Error('Invalid authentication')
    }

    // Obtain the parts of the request url
    const pathParts = req.url.split('/')
    const action = pathParts[1]
    const device = pathParts[2]
    const attribute = pathParts[3]
    const newStatus = pathParts[4]

    // Check an action was specified
    if (!action) {
      throw new Error('No action specified')
    }

    // Check the action is either get or set
    if (!['get', 'set'].includes(action)) {
      throw new Error("Action must be 'get' or 'set'")
    }

    // Check a device was specified
    if (!device) {
      throw new Error('No accessory specified')
    }

    // Special case for the device list
    if (device === 'devicelist') {
      const deviceList = []
      this.devicesInHB.forEach(accessory => {
        if (accessory.context.hidden) {
          return
        }
        deviceList.push({
          name: accessory.displayName,
          hbdeviceid: accessory.context.hbDeviceId,
          statuswan: !!accessory.context.reachableWAN,
          statuslan: !!accessory.context.reachableLAN,
          localip: accessory.context.reachableLAN || false
        })
      })
      return deviceList
    }

    // Try and find the device in Homebridge
    const uuid = this.hapUUIDGen(device)
    if (!this.devicesInHB.has(uuid)) {
      throw new Error('Accessory not found in Homebridge')
    }

    // Obtain the corresponding accessory
    const accessory = this.devicesInHB.get(uuid)

    // Check the accessory isn't hidden from Homebridge
    if (accessory.context.hidden) {
      throw new Error('Accessory not found in Homebridge')
    }

    // Special case for the reachable WAN and LAN attributes
    if (action === 'get') {
      if (attribute === 'statuswan') {
        return accessory.context.reachableWAN ? 'online' : 'offline'
      }
      if (attribute === 'statuslan') {
        return accessory.context.reachableLAN ? 'online' : 'offline'
      }
    }

    // Check the device is controllable
    if (!accessory.control) {
      throw new Error('Accessory has not been initialised yet')
    }

    // Check an attribute was specified
    if (!attribute) {
      throw new Error('No attribute specified')
    }

    // Check a new status was supplied if the action is set
    if (action === 'set') {
      if (!newStatus) {
        throw new Error('No new status specified')
      }
    }

    // These variables depend on the attribute that was supplied
    let service
    let charName

    switch (attribute) {
      case 'adaptivelighting':
      case 'colourtemperature':
        // This can apply to lights that support colour
        service = accessory.getService(this.hapServ.Lightbulb)

        // Check the accessory has one of these services
        if (service) {
          charName = service.testCharacteristic(this.hapChar.ColorTemperature)
            ? this.hapChar.ColorTemperature
            : false
        }
        break
      case 'brightness':
        // This can apply to lights
        service = accessory.getService(this.hapServ.Lightbulb)

        // Check the accessory has one of these services
        if (service) {
          charName = service.testCharacteristic(this.hapChar.Brightness)
            ? this.hapChar.Brightness
            : false
        }
        break
      case 'hue':
        // This can apply to lights that support colour
        service = accessory.getService(this.hapServ.Lightbulb)

        // Check the accessory has one of these services
        if (service) {
          charName = service.testCharacteristic(this.hapChar.Hue)
            ? this.hapChar.Hue
            : false
        }
        break
      case 'humidity':
        // This can apply to humidity sensors
        service = accessory.getService(this.hapServ.HumiditySensor)

        // Check the accessory has one of these services
        if (service) {
          charName = service.testCharacteristic(this.hapChar.CurrentRelativeHumidity)
            ? this.hapChar.CurrentRelativeHumidity
            : false
        }
        break
      case 'state':
        // This can apply to switches outlets and lights
        service = accessory.getService(this.hapServ.Switch) ||
          accessory.getService(this.hapServ.Outlet) ||
          accessory.getService(this.hapServ.Lightbulb)

        // Check the accessory has one of these services
        if (service) {
          charName = service.testCharacteristic(this.hapChar.On)
            ? this.hapChar.On
            : false
        }
        break
      case 'temperature':
        // This can apply to temperature sensors
        service = accessory.getService(this.hapServ.TemperatureSensor)

        // Check the accessory has one of these services
        if (service) {
          charName = service.testCharacteristic(this.hapChar.CurrentTemperature)
            ? this.hapChar.CurrentTemperature
            : false
        }
        break
      default:
        throw new Error('Invalid attribute given')
    }

    // Check that the accessory has the corresponding characteristic for the attribute
    if (!charName) {
      throw new Error('Accessory does not support attribute:' + attribute)
    }

    // Obtain the cached value of the accessory-service-characteristic
    const currentHKStatus = service.getCharacteristic(charName).value

    // With a get action we return the cache value from above
    if (action === 'get') {
      switch (attribute) {
        case 'adaptivelighting':
          return accessory.alController &&
            accessory.alController.isAdaptiveLightingActive()
            ? 'on'
            : 'off'
        case 'brightness':
        case 'colourtemperature':
        case 'hue':
        case 'humidity':
        case 'temperature':
          return service.getCharacteristic(charName).value
        case 'state':
          return service.getCharacteristic(charName).value ? 'on' : 'off'
        default:
          throw new Error("Invalid attribute for action:get'")
      }
    }

    // With a set action we need to call the set handler for the characteristic
    if (action === 'set') {
      let newHKStatus
      switch (attribute) {
        case 'brightness': {
          // The new status for brightness must be an integer between 0 and 100
          newHKStatus = parseInt(newStatus)
          if (isNaN(newHKStatus) || newHKStatus < 0 || newHKStatus > 100) {
            throw new Error(
              'New status must be integer 0-100 for attribute:brightness'
            )
          }

          // Check the accessory has a correct set handler for on/off
          if (!accessory.control.internalBrightnessUpdate) {
            throw new Error('Function to control accessory not found')
          }

          // Call the set handler to send the request to eWeLink
          await accessory.control.internalBrightnessUpdate(newHKStatus)
          break
        }
        case 'colourtemperature': {
          // The new status for colour temperature must be an integer between 140 and 500
          newHKStatus = parseInt(newStatus)
          if (isNaN(newHKStatus) || newHKStatus < 140 || newHKStatus > 500) {
            throw new Error(
              'New status must be integer 140-500 for attribute:colourtemperature'
            )
          }

          // Check the accessory has a correct set handler for on/off
          if (!accessory.control.internalCTUpdate) {
            throw new Error('Function to control accessory not found')
          }

          // Call the set handler to send the request to eWeLink
          if (
            accessory.alController &&
            accessory.alController.isAdaptiveLightingActive()
          ) {
            accessory.alController.disableAdaptiveLighting()
          }
          await accessory.control.internalCTUpdate(newHKStatus)
          break
        }
        case 'hue': {
          // The new status for hue must be an integer between 0 and 360
          newHKStatus = parseInt(newStatus)
          if (isNaN(newHKStatus) || newHKStatus < 0 || newHKStatus > 360) {
            throw new Error(
              'New status must be integer 0-360 for attribute:hue'
            )
          }

          // Check the accessory has a correct set handler for on/off
          if (!accessory.control.internalColourUpdate) {
            throw new Error('Function to control accessory not found')
          }

          // Call the set handler to send the request to eWeLink
          if (
            accessory.alController &&
            accessory.alController.isAdaptiveLightingActive()
          ) {
            accessory.alController.disableAdaptiveLighting()
          }
          await accessory.control.internalColourUpdate(newHKStatus)
          break
        }
        case 'state':
          // The new status for state must be on, off or toggle
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
            default:
              throw new Error(
                "New status must be 'on', 'off' or 'toggle' for attribute:state"
              )
          }

          // Check the accessory has a correct set handler for on/off
          if (!accessory.control.internalStateUpdate) {
            throw new Error('Function to control accessory not found')
          }

          // Call the set handler to send the request to eWeLink
          await accessory.control.internalStateUpdate(newHKStatus)
          break
        default:
          throw new Error("Invalid attribute for action:set'")
      }

      // The eWeLink request was successful so update the characteristic in HomeKit
      service.updateCharacteristic(charName, newHKStatus)
    }
  }
}
