var WebSocket = require('ws');
var http = require('http');
var url = require('url');
var request = require('request-json');
const ewelink = require('ewelink-api');

var nonce = require('nonce')();

var wsc;
var isSocketOpen = false;
var sequence = 0;
var webClient = '';
var apiKey = 'UNCONFIGURED';
var authenticationToken = 'UNCONFIGURED';
var phoneNumberOrEmail = '';
var accountPassword = '';
var Accessory, Service, Characteristic, UUIDGen;

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

}

// Platform constructor
function eWeLink(log, config, api) {

	log("Intialising eWeLink");

	var platform = this;

	this.log = log;
	this.config = config;
	this.accessories = new Map();
	this.authenticationToken = 'UNCONFIGURED';
	this.phoneNumberOrEmail = config['phoneNumberOrEmail'];
	this.accountPassword = config['accountPassword'];


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

			const connection = new ewelink({
				email: this.phoneNumberOrEmail,
				password: this.accountPassword
			});

			this.authenticationToken = connection.getCredentialsMixin();

			/* get all devices */
			platform.log("Requesting a list of devices from eWeLink HTTPS API at [%s]", url);
			const devices = connection.getDevices();
			console.log(devices);

			var size = devices.length;
			platform.log("eWeLink HTTPS API reports that there are a total of [%s] devices registered", size);

			if (size == 0) {
				platform.log("As there were no devices were found, all devices have been removed from the platorm's cache. Please regiester your devices using the eWeLink app and restart HomeBridge");
				platform.accessories.clear();
				platform.api.unregisterPlatformAccessories("homebridge-eWeLink", "eWeLink", platform.accessories);
				return;
			}

			var devicesFromApi = new Map();
			var newDevicesToAdd = new Map();

			devices.forEach((device) => {
				platform.apiKey = device.apikey;
				devicesFromApi.set(device.deviceid, device);
			})

			// Now we compare the cached devices against the web list
			platform.log("Evaluating if devices need to be removed...");

			function checkIfDeviceIsStillRegistered(value, deviceId, map) {

				var accessory = platform.accessories.get(deviceId);

				if (devicesFromApi.has(deviceId)) {
					platform.log('Device [%s] is regeistered with API. Nothing to do.', accessory.displayName);
				} else {
					platform.log('Device [%s], ID : [%s] was not present in the response from the API. It will be removed.', accessory.displayName, accessory.UUID);
					platform.removeAccessory(accessory);
				};
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

					var accessory = platform.accessories.get(deviceId);
					var deviceInformationFromWebApi = devicesFromApi.get(deviceId);

					accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Name, deviceInformationFromWebApi.name);
					accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.SerialNumber, deviceInformationFromWebApi.extra.extra.mac);
					accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, deviceInformationFromWebApi.productModel);
					accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Model, deviceInformationFromWebApi.extra.extra.model);
					accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.FirmwareRevision, deviceInformationFromWebApi.params.fwVersion);
					platform.updatePowerStateCharacteristic(deviceId, deviceInformationFromWebApi.params.switch);


				} else {
					var deviceToAdd = devicesFromApi.get(deviceId);
					platform.log('Device [%s], ID : [%s] will be added', deviceToAdd.name, deviceToAdd.deviceid);
					platform.addAccessory(deviceToAdd);
				};
			}

			// Go through the web response to make sure that all the devices that are in the response do exist in the accessories map
			if (devicesFromApi.size > 0) {
				devicesFromApi.forEach(checkIfDeviceIsAlreadyConfigured);
			}

			platform.log("API key retrieved from web service is [%s]", platform.apiKey);

			// We have our devices, now open a connection to the WebSocket API

			var url = 'wss://' + platform.config['webSocketApi'] + ':8080/api/ws';

			platform.log("Connecting to the WebSocket API at [%s]", url);

			platform.wsc = new WebSocketClient();

			platform.wsc.open(url);

			platform.wsc.onmessage = function(message) {

				platform.log("WebSocket messge received: ", message);

				var json = JSON.parse(message);

				if (json.hasOwnProperty("action")) {

					if (json.action == 'update') {

						platform.log("Update message received for device [%s]", json.deviceid);

						if (json.hasOwnProperty("params") && json.params.hasOwnProperty("switch")) {
							platform.updatePowerStateCharacteristic(json.deviceid, json.params.switch);
						}

					}

				}

			}

			platform.wsc.onopen = function(e) {

				platform.isSocketOpen = true;

				// We need to authenticate upon opening the connection

				var time_stamp = new Date() / 1000;
				var ts = Math.floor(time_stamp);

				// Here's the eWeLink payload as discovered via Charles
				var payload = {};
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

				var string = JSON.stringify(payload);

				platform.log('Sending login request [%s]', string);

				platform.wsc.send(string);

			}

			platform.wsc.onclose = function(e) {
				platform.log("WebSocket was closed. Reason [%s]", e);
				platform.isSocketOpen = false;
			}

		}); // End WebSocket

	}.(this));
}


// Function invoked when homebridge tries to restore cached accessory.
// We update the existing devices as part of didFinishLaunching(), as to avoid an additional call to the the HTTPS API.
eWeLink.prototype.configureAccessory = function(accessory) {

	this.log(accessory.displayName, "Configure Accessory");

	var platform = this;

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

}

// Sample function to show how developer can add accessory dynamically from outside event
eWeLink.prototype.addAccessory = function(device) {

	// Here we need to check if it is currently there
	if (this.accessories.get(device.deviceid)) {
		this.log("Not adding [%s] as it already exists in the cache", device.deviceid);
		return
	}

	var platform = this;

	if (device.type != 10) {
		this.log("A device with an unknown type was returned. It will be skipped.", device.type);
		return;
	}

	this.log("Found Accessory with Name : [%s], Manufacturer : [%s], Status : [%s], Is Online : [%s], API Key: [%s] ", device.name, device.productModel, device.params.switch, device.online, device.apikey);

	const accessory = new Accessory(device.name, UUIDGen.generate(device.deviceid.toString()))

	accessory.context.deviceId = device.deviceid
	accessory.context.apiKey = device.apikey;

	if (device.online == 'true') {
		accessory.reachable = true;
	} else {
		accessory.reachable = false;
	}

	var platform = this;
	accessory.addService(Service.Switch, device.name)
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

	this.accessories.set(device.deviceid, accessory);

	this.api.registerPlatformAccessories("homebridge-eWeLink",
		"eWeLink", [accessory]);

}

eWeLink.prototype.getSequence = function() {
	var time_stamp = new Date() / 1000;
	this.sequence = Math.floor(time_stamp * 1000);
	return this.sequence;
}

eWeLink.prototype.updatePowerStateCharacteristic = function(deviceId, state) {

	// Used when we receive an update from an external source

	var platform = this;

	var isOn = false;

	var accessory = platform.accessories.get(deviceId);

	if (state == 'on') {
		isOn = true;
	}

	platform.log("Updating recorded Characteristic.On for [%s] to [%s]. No request will be sent to the device.", accessory.displayName, isOn);

	accessory.getService(Service.Switch)
		.setCharacteristic(Characteristic.On, isOn);

}


eWeLink.prototype.getPowerState = function(accessory, callback) {
	var platform = this;

	platform.log("Requesting power state for [%s]", accessory.displayName);

	this.webClient.get('/api/user/device', function(err, res, body) {

		if (body.hasOwnProperty('error')) {
			platform.log("An error was encountered while requesting a list of devices while interrogating power status. Verify your configuration options. Response was [%s]", JSON.stringify(body));
			callback('An error was encountered while requesting a list of devices to interrogate power status for your device');
			return;
		}

		var size = Object.keys(body).length;

		if (body.length < 1) {
			callback('An error was encountered while requesting a list of devices to interrogate power status for your device');
			accessory.reachable = false;
			return;
		}

		var filteredResponse = body.filter(device => (device.deviceid == accessory.context.deviceId));

		if (filteredResponse.length == 1) {

			var device = filteredResponse[0];

			if (device.deviceid == accessory.context.deviceId) {

				if (device.online != true) {
					accessory.reachable = false;
					platform.log("Device [%s] was reported to be offline by the API", accessory.displayName);
					callback('API reported that [%s] is not online', device.name);
					return;
				}

				if (device.params.switch == 'on') {
					accessory.reachable = true;
					platform.log('API reported that [%s] is On', device.name);
					callback(null, 1);
					return;
				} else if (device.params.switch == 'off') {
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


}

eWeLink.prototype.setPowerState = function(accessory, isOn, callback) {
	var platform = this;
	var options = {};
	options.protocolVersion = 13;

	var targetState = 'off';

	if (isOn) {
		targetState = 'on';
	}

	platform.log("Setting power state to [%s] for device [%s]", targetState, accessory.displayName);

	var payload = {};
	payload.action = 'update';
	payload.userAgent = 'app';
	payload.apikey = '' + accessory.context.apiKey;
	payload.deviceid = '' + accessory.context.deviceId;
	payload.params = {};
	payload.params.switch = targetState;
	payload.sequence = platform.getSequence();

	var string = JSON.stringify(payload);
	// platform.log( string );

	if (platform.isSocketOpen) {

		platform.wsc.send(string);

		// TODO Here we need to wait for the response to the socket

		callback();

	} else {
		callback('Socket was closed. It will reconnect automatically; please retry your command');
	}

}


// Sample function to show how developer can remove accessory dynamically from outside event
eWeLink.prototype.removeAccessory = function(accessory) {

	this.log('Removing accessory [%s]', accessory.displayName)

	this.accessories.delete(accessory.context.deviceId)

	this.api.unregisterPlatformAccessories('homebridge-eWeLink',
		'eWeLink', [accessory])
}

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
}
WebSocketClient.prototype.send = function(data, option) {
	try {
		this.instance.send(data, option);
	} catch (e) {
		this.instance.emit('error', e);
	}
}
WebSocketClient.prototype.reconnect = function(e) {
	console.log(`WebSocketClient: retry in ${this.autoReconnectInterval}ms`, e);

	this.instance.removeAllListeners();

	var platform = this;
	setTimeout(function() {
		console.log("WebSocketClient: reconnecting...");
		platform.open(platform.url);
	}, this.autoReconnectInterval);
}
WebSocketClient.prototype.onopen = function(e) {
	console.log("WebSocketClient: open", arguments);
}
WebSocketClient.prototype.onmessage = function(data, flags, number) {
	console.log("WebSocketClient: message", arguments);
}
WebSocketClient.prototype.onerror = function(e) {
	console.log("WebSocketClient: error", arguments);
}
WebSocketClient.prototype.onclose = function(e) {
	console.log("WebSocketClient: closed", arguments);
}
