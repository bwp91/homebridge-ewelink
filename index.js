let WebSocket = require('ws');
let http = require('http');
let url = require('url');
let request = require('request-json');
let nonce = require('nonce')();

let wsc;
let isSocketOpen = false;
let sequence = 0;
let webClient = '';
let apiKey = 'UNCONFIGURED';
let authenticationToken = 'UNCONFIGURED';
let Accessory, Service, Characteristic, UUIDGen;

module.exports = function(homebridge) {
    console.log("homebridge API version: " + homebridge.version);

    // Accessory must be created from PlatformAccessory Constructor
    Accessory = homebridge.platformAccessory;

    // Service and Characteristic are from hap-nodejs
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;

    // For platform plugin to be considered as dynamic platform plugin,
    // registerPlatform(pluginName, platformName, constructor, dynamic), dynamic must be true
    homebridge.registerPlatform("homebridge-eWeLink", "eWeLink", eWeLink, true);

};

// Platform constructor
function eWeLink(log, config, api) {

    if(!config || !config['authenticationToken']){
        log("Initialization skipped. Missing configuration data.");
        return;
    }

    log("Intialising eWeLink");

    let platform = this;

    this.log = log;
    this.config = config;
    this.accessories = new Map();
    this.authenticationToken = config['authenticationToken'];
    this.devicesFromApi = new Map();;

    if (api) {
        // Save the API object as plugin needs to register new accessory via this object
        this.api = api;

        // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories.
        // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
        // Or start discover new accessories.


        this.api.on('didFinishLaunching', function() {

            platform.log("A total of [%s] accessories were loaded from the local cache", platform.accessories.size);

            // Get a list of all devices from the API, and compare it to the list of cached devices.
            // New devices will be added, and devices that exist in the cache but not in the web list
            // will be removed from Homebridge.

            let url = 'https://' + this.config['apiHost'];

            platform.log("Requesting a list of devices from eWeLink HTTPS API at [%s]", url);

            this.webClient = request.createClient(url);

            this.webClient.headers['Authorization'] = 'Bearer ' + this.authenticationToken;
            this.webClient.get('/api/user/device', function(err, res, body) {

                if (err){
                    platform.log("An error was encountered while requesting a list of devices. Error was [%s]", err);
                    return;
                } else if (!body || body.hasOwnProperty('error')) {

                    let response = JSON.stringify(body);

                    platform.log("An error was encountered while requesting a list of devices. Response was [%s]", response);

                    if (body && body.error === '401') {
                        platform.log("Verify that you have the correct authenticationToken specified in your configuration. The currently-configured token is [%s]", platform.authenticationToken);
                    }

                    return;
                }

                let size = Object.keys(body).length;
                platform.log("eWeLink HTTPS API reports that there are a total of [%s] devices registered", size);

                if (size === 0) {
                    platform.log("As there were no devices were found, all devices have been removed from the platorm's cache. Please regiester your devices using the eWeLink app and restart HomeBridge");
                    platform.accessories.clear();
                    platform.api.unregisterPlatformAccessories("homebridge-eWeLink", "eWeLink", platform.accessories);
                    return;
                }

                let newDevicesToAdd = new Map();

                body.forEach((device) => {
                    platform.apiKey = device.apikey;
                    platform.devicesFromApi.set(device.deviceid, device);
                });

                // Now we compare the cached devices against the web list
                platform.log("Evaluating if devices need to be removed...");

                function checkIfDeviceIsStillRegistered(value, deviceId, map) {

                    let accessory = platform.accessories.get(deviceId);

                    if(accessory.context.switches > 1) {
                        deviceId = deviceId.replace('CH'+accessory.context.channel,"");
                    }

                    if (platform.devicesFromApi.has(deviceId)) {
                        platform.log('Device [%s] is regeistered with API. Nothing to do.', accessory.displayName);
                    } else {
                        platform.log('Device [%s], ID : [%s] was not present in the response from the API. It will be removed.', accessory.displayName, accessory.UUID);
                        platform.removeAccessory(accessory);
                    }
                }

                // If we have devices in our cache, check that they exist in the web response
                if (platform.accessories.size > 0) {
                    platform.log("Verifying that all cached devices are still registered with the API. Devices that are no longer registered with the API will be removed.");
                    platform.accessories.forEach(checkIfDeviceIsStillRegistered);
                }

                platform.log("Evaluating if new devices need to be added...");

                // Now we compare the cached devices against the web list
                function checkIfDeviceIsAlreadyConfigured(value, deviceId, map) {

                    if (platform.accessories.has(deviceId)) {

                        platform.log('Device with ID [%s] is already configured. Ensuring that the configuration is current.', deviceId);

                        let accessory = platform.accessories.get(deviceId);
                        let deviceInformationFromWebApi = platform.devicesFromApi.get(deviceId);
                        let switchesAmount = 0;

                        accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.SerialNumber, deviceInformationFromWebApi.extra.extra.mac);
                        accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, deviceInformationFromWebApi.productModel);
                        accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Model, deviceInformationFromWebApi.extra.extra.model);
                        accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.FirmwareRevision, deviceInformationFromWebApi.params.fwVersion);

                        switch(deviceInformationFromWebApi.extra.extra.model) {
                            case 'PSF-B04-GL' :
                                switchesAmount = 3;
                                break;
                            case 'PSB-B04-GL' :
                                switchesAmount = 2;
                                break;
                            case 'PSF-A04-GL' :
                                switchesAmount = 4;
                                break;
                        }

                        if(switchesAmount > 1) {
                            platform.log(switchesAmount + " channels device has been set: " + deviceInformationFromWebApi.extra.extra.model);
                            for(let i=0; i!==switchesAmount; i++) {
                                accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Name, deviceInformationFromWebApi.name + ' CH ' + (i+1));
                                platform.updatePowerStateCharacteristic(deviceId + 'CH' + (i+1), deviceInformationFromWebApi.params.switches[i].switch, platform.devicesFromApi.get(deviceId));
                            }
                        } else  {
                            platform.log("Single channel device has been set: " + deviceInformationFromWebApi.extra.extra.model);
                            accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Name, deviceInformationFromWebApi.name);
                            platform.updatePowerStateCharacteristic(deviceId, deviceInformationFromWebApi.params.switch);
                        }

                    } else {
                        let deviceToAdd = platform.devicesFromApi.get(deviceId);
                        let switchesAmount = 1;

                        switch(deviceToAdd.extra.extra.model) {
                            case 'PSF-B04-GL' :
                                switchesAmount = 3;
                                break;
                            case 'PSB-B04-GL' :
                                switchesAmount = 2;
                                break;
                            case 'PSF-A04-GL' :
                                switchesAmount = 4;
                                break;
                        }

                        if(switchesAmount > 1) {
                            for(let i=0; i!==switchesAmount; i++) {
                                platform.log('Device [%s], ID : [%s] will be added', deviceToAdd.name, deviceId + 'CH' + (i+1));
                                platform.addAccessory(deviceToAdd, deviceId + 'CH' + (i+1));
                            }
                        } else {
                            platform.log('Device [%s], ID : [%s] will be added', deviceToAdd.name, deviceToAdd.deviceid);
                            platform.addAccessory(deviceToAdd);
                        }
                    }
                }

                // Go through the web response to make sure that all the devices that are in the response do exist in the accessories map
                if (platform.devicesFromApi.size > 0) {
                    platform.devicesFromApi.forEach(checkIfDeviceIsAlreadyConfigured);
                }

                platform.log("API key retrieved from web service is [%s]", platform.apiKey);

                // We have our devices, now open a connection to the WebSocket API

                let url = 'wss://' + platform.config['webSocketApi'] + ':8080/api/ws';

                platform.log("Connecting to the WebSocket API at [%s]", url);

                platform.wsc = new WebSocketClient();

                platform.wsc.open(url);

                platform.wsc.onmessage = function(message) {

                    //platform.log("WebSocket messge received: ", message);

                    let json = JSON.parse(message);

                    if (json.hasOwnProperty("action")) {

                        if (json.action === 'update') {

                            //platform.log("Update message received for device [%s]", json.deviceid);

                            if (json.hasOwnProperty("params") && json.params.hasOwnProperty("switch")) {
                                platform.updatePowerStateCharacteristic(json.deviceid, json.params.switch);
                            }

                        }

                    }

                };

                platform.wsc.onopen = function(e) {

                    platform.isSocketOpen = true;

                    // We need to authenticate upon opening the connection

                    let time_stamp = new Date() / 1000;
                    let ts = Math.floor(time_stamp);

                    // Here's the eWeLink payload as discovered via Charles
                    let payload = {};
                    payload.action = "userOnline";
                    payload.userAgent = 'app';
                    payload.version = 6;
                    payload.nonce = '' + nonce();
                    payload.apkVesrion = "1.8";
                    payload.os = 'ios';
                    payload.at = config.authenticationToken;
                    payload.apikey = platform.apiKey;
                    payload.ts = '' + ts;
                    payload.model = 'iPhone10,6';
                    payload.romVersion = '11.1.2';
                    payload.sequence = platform.getSequence();

                    let string = JSON.stringify(payload);

                    platform.log('Sending login request [%s]', string);

                    platform.wsc.send(string);

                };

                platform.wsc.onclose = function(e) {
                    platform.log("WebSocket was closed. Reason [%s]", e);
                    platform.isSocketOpen = false;
                }

            }); // End WebSocket

        }.bind(this));
    }
}

// Function invoked when homebridge tries to restore cached accessory.
// We update the existing devices as part of didFinishLaunching(), as to avoid an additional call to the the HTTPS API.
eWeLink.prototype.configureAccessory = function(accessory) {

    this.log(accessory.displayName, "Configure Accessory");

    let platform = this;

    if (accessory.getService(Service.Switch)) {

        accessory.getService(Service.Switch)
            .getCharacteristic(Characteristic.On)
            .on('set', function(value, callback) {
                platform.setPowerState(accessory, value, callback);
            })
            .on('get', function(callback) {
                platform.getPowerState(accessory, callback);
            });

    }

    this.accessories.set(accessory.context.deviceId, accessory);

};

// Sample function to show how developer can add accessory dynamically from outside event
eWeLink.prototype.addAccessory = function(device, deviceId = null) {

    // Here we need to check if it is currently there
    if (this.accessories.get(deviceId ? deviceId : device.deviceid)) {
        this.log("Not adding [%s] as it already exists in the cache", deviceId ? deviceId : device.deviceid);
        return
    }

    let platform = this;
    let channel = 0;

    if (device.type != 10) {
        this.log("A device with an unknown type was returned. It will be skipped.", device.type);
        return;
    }

    if(deviceId) {
        let id = deviceId.split("CH");
        channel = id[1];
    }

    const status = channel && device.params.switches && device.params.switches[channel-1] ? device.params.switches[channel-1].switch : device.params.switch || "off"
    this.log("Found Accessory with Name : [%s], Manufacturer : [%s], Status : [%s], Is Online : [%s], API Key: [%s] ", device.name + (channel ? ' CH ' + channel : ''), device.productModel, status, device.online, device.apikey);
    const accessory = new Accessory(device.name + (channel ? ' CH ' + channel : ''), UUIDGen.generate((deviceId ? deviceId : device.deviceid).toString()));

    accessory.context.deviceId = deviceId ? deviceId : device.deviceid;
    accessory.context.apiKey = device.apikey;
    accessory.context.switches = 1;
    accessory.context.channel = channel;

    accessory.reachable = device.online === 'true';

    accessory.addService(Service.Switch, device.name + (channel ? ' CH ' + channel : ''))
        .getCharacteristic(Characteristic.On)
        .on('set', function(value, callback) {
            platform.setPowerState(accessory, value, callback);
        })
        .on('get', function(callback) {
            platform.getPowerState(accessory, callback);
        });


    accessory.on('identify', function(paired, callback) {
        platform.log(accessory.displayName, "Identify not supported");
        callback();
    });

    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.SerialNumber, device.extra.extra.mac);
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, device.productModel);
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Model, device.extra.extra.model);
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Identify, false);
    accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.FirmwareRevision, device.params.fwVersion);

    switch(device.extra.extra.model) {
        case 'PSF-B04-GL' :
             accessory.context.switches = 3;
            break;
        case 'PSB-B04-GL' :
            accessory.context.switches = 2;
            break;
        case 'PSF-A04-GL' :
            accessory.context.switches = 4;
            break;
    }

    this.accessories.set(device.deviceid, accessory);

    this.api.registerPlatformAccessories("homebridge-eWeLink",
        "eWeLink", [accessory]);

};

eWeLink.prototype.getSequence = function() {
    let time_stamp = new Date() / 1000;
    this.sequence = Math.floor(time_stamp * 1000);
    return this.sequence;
};

eWeLink.prototype.updatePowerStateCharacteristic = function(deviceId, state, device = null, channel = null) {

    // Used when we receive an update from an external source

    let platform = this;

    let isOn = false;

    let accessory = platform.accessories.get(deviceId);

    if(typeof accessory === 'undefined' && device) {
        platform.addAccessory(device, deviceId);
        accessory = platform.accessories.get(deviceId);
    }

    if (state === 'on') {
        isOn = true;
    }

    platform.log("Updating recorded Characteristic.On for [%s] to [%s]. No request will be sent to the device.", accessory.displayName, isOn);

    accessory.getService(Service.Switch)
        .setCharacteristic(Characteristic.On, isOn);

};


eWeLink.prototype.getPowerState = function(accessory, callback) {
    let platform = this;

    platform.log("Requesting power state for [%s]", accessory.displayName);

    this.webClient.get('/api/user/device', function(err, res, body) {

        if (err){
            platform.log("An error was encountered while requesting a list of devices while interrogating power status. Verify your configuration options. Error was [%s]", err);
            return;
        } else if (!body || body.hasOwnProperty('error')) {
            platform.log("An error was encountered while requesting a list of devices while interrogating power status. Verify your configuration options. Response was [%s]", JSON.stringify(body));
            callback('An error was encountered while requesting a list of devices to interrogate power status for your device');
            return;
        }

        let size = Object.keys(body).length;

        if (body.length < 1) {
            callback('An error was encountered while requesting a list of devices to interrogate power status for your device');
            accessory.reachable = false;
            return;
        }

        let deviceId = accessory.context.deviceId;

        if(accessory.context.switches > 1) {
            deviceId = deviceId.replace("CH" + accessory.context.channel, "");
        }

        let filteredResponse = body.filter(device => (device.deviceid === deviceId));

        if (filteredResponse.length === 1) {

            let device = filteredResponse[0];

            if (device.deviceid === deviceId) {

                if (device.online !== true) {
                    accessory.reachable = false;
                    platform.log("Device [%s] was reported to be offline by the API", accessory.displayName);
                    callback('API reported that [%s] is not online', device.name);
                    return;
                }

                if(accessory.context.switches > 1) {

                    if (device.params.switches[accessory.context.channel-1].switch === 'on') {
                        accessory.reachable = true;
                        platform.log('API reported that [%s] CH %s is On', device.name, accessory.context.channel);
                        callback(null, 1);
                        return;
                    } else if (device.params.switches[accessory.context.channel-1].switch === 'off') {
                        accessory.reachable = true;
                        platform.log('API reported that [%s] CH %s is Off', device.name, accessory.context.channel);
                        callback(null, 0);
                        return;
                    } else {
                        accessory.reachable = false;
                        platform.log('API reported an unknown status for device [%s]', accessory.displayName);
                        callback('API returned an unknown status for device ' + accessory.displayName);
                        return;
                    }

                } else {

                    if (device.params.switch === 'on') {
                        accessory.reachable = true;
                        platform.log('API reported that [%s] is On', device.name);
                        callback(null, 1);
                        return;
                    } else if (device.params.switch === 'off') {
                        accessory.reachable = true;
                        platform.log('API reported that [%s] is Off', device.name);
                        callback(null, 0);
                        return;
                    } else {
                        accessory.reachable = false;
                        platform.log('API reported an unknown status for device [%s]', accessory.displayName);
                        callback('API returned an unknown status for device ' + accessory.displayName);
                        return;
                    }

                }

            }

        } else if (filteredResponse.length > 1) {
            // More than one device matches our Device ID. This should not happen.
            platform.log("ERROR: The response contained more than one device with Device ID [%s]. Filtered response follows.", device.deviceid);
            platform.log(filteredResponse);
            callback("The response contained more than one device with Device ID " + device.deviceid);

        } else if (filteredResponse.length < 1) {

            // The device is no longer registered

            platform.log("Device [%s] did not exist in the response. It will be removed", accessory.displayName);
            platform.removeAccessory(accessory);

        }

    });


};

eWeLink.prototype.setPowerState = function(accessory, isOn, callback) {
    let platform = this;
    let options = {};
    let deviceId = accessory.context.deviceId;
    options.protocolVersion = 13;

    let targetState = 'off';

    if (isOn) {
        targetState = 'on';
    }

    platform.log("Setting power state to [%s] for device [%s]", targetState, accessory.displayName);

    let payload = {};
    payload.action = 'update';
    payload.userAgent = 'app';
    payload.params = {};
    if(accessory.context.switches > 1) {
        deviceId = deviceId.replace("CH"+accessory.context.channel,"");
        let deviceInformationFromWebApi = platform.devicesFromApi.get(deviceId);
        payload.params.switches = deviceInformationFromWebApi.params.switches;
        payload.params.switches[accessory.context.channel - 1].switch = targetState;
    }
    else {
        payload.params.switch = targetState;
    }
    payload.apikey = '' + accessory.context.apiKey;
    payload.deviceid = '' + deviceId;

    payload.sequence = platform.getSequence();

    let string = JSON.stringify(payload);
    // platform.log( string );

    if (platform.isSocketOpen) {

        platform.wsc.send(string);

        // TODO Here we need to wait for the response to the socket

        callback();

    } else {
        callback('Socket was closed. It will reconnect automatically; please retry your command');
    }

};


// Sample function to show how developer can remove accessory dynamically from outside event
eWeLink.prototype.removeAccessory = function(accessory) {

    this.log('Removing accessory [%s]', accessory.displayName);

    this.accessories.delete(accessory.context.deviceId);

    this.api.unregisterPlatformAccessories('homebridge-eWeLink',
        'eWeLink', [accessory]);
};

/* WEB SOCKET STUFF */

function WebSocketClient() {
    this.number = 0; // Message number
    this.autoReconnectInterval = 5 * 1000; // ms
}
WebSocketClient.prototype.open = function(url) {
    this.url = url;
    this.instance = new WebSocket(this.url);
    this.instance.on('open', () => {
        this.onopen();
    });

    this.instance.on('message', (data, flags) => {
        this.number++;
        this.onmessage(data, flags, this.number);
    });

    this.instance.on('close', (e) => {
        switch (e) {
            case 1000: // CLOSE_NORMAL
                // console.log("WebSocket: closed");
                break;
            default: // Abnormal closure
                this.reconnect(e);
                break;
        }
        this.onclose(e);
    });
    this.instance.on('error', (e) => {
        switch (e.code) {
            case 'ECONNREFUSED':
                this.reconnect(e);
                break;
            default:
                this.onerror(e);
                break;
        }
    });
};
WebSocketClient.prototype.send = function(data, option) {
    try {
        this.instance.send(data, option);
    } catch (e) {
        this.instance.emit('error', e);
    }
};
WebSocketClient.prototype.reconnect = function(e) {
    // console.log(`WebSocketClient: retry in ${this.autoReconnectInterval}ms`, e);

    this.instance.removeAllListeners();

    let platform = this;
    setTimeout(function() {
        console.log("WebSocketClient: reconnecting...");
        platform.open(platform.url);
    }, this.autoReconnectInterval);
};
WebSocketClient.prototype.onopen = function(e) {
    // console.log("WebSocketClient: open", arguments);
};
WebSocketClient.prototype.onmessage = function(data, flags, number) {
    // console.log("WebSocketClient: message", arguments);
};
WebSocketClient.prototype.onerror = function(e) {
    console.log("WebSocketClient: error", arguments);
};
WebSocketClient.prototype.onclose = function(e) {
    // console.log("WebSocketClient: closed", arguments);
};
