/* jshint esversion: 9, -W030, node: true */
const ewelinkapi = require('ewelink-api');

var Accessory, Service, Characteristic, UUIDGen;

module.exports = function (homebridge) {
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
   
   log("Intialising eWeLink");
   
   var platform = this;
   
   this.log = log;
   this.config = config;
   this.accessories = new Map();
   this.authenticationToken = 'UNCONFIGURED';
   this.phoneNumberOrEmail = config.phoneNumberOrEmail;
   this.accountPassword = config.accountPassword;
   this.debug = (config.debug === 'true') ? true : false;
   
   if (api) {
      
      // Save the API object as plugin needs to register new accessory via this object
      this.api = api;
      
      // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories.
      // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
      // Or start discover new accessories.
      
      this.api.on('didFinishLaunching', function () {
         
         platform.log("A total of [%s] accessories were loaded from the local cache", platform.accessories.size);
         
         // Get a list of all devices from the API, and compare it to the list of cached devices.
         // New devices will be added, and devices that exist in the cache but not in the web list
         // will be removed from Homebridge.
         
         (async () => {
            
            const connection = new ewelinkapi({
               email: this.phoneNumberOrEmail,
               password: this.accountPassword
            });
            this.connection = connection;
            this.authenticationToken = await connection.getCredentials();
            if (this.debug) platform.log("authenticationToken %s", JSON.stringify(this.authenticationToken));
            
            /* get all devices */
            platform.log("Requesting a list of devices from eWeLink HTTPS API");
            const devices = await connection.getDevices();
            //				console.log(JSON.stringify(devices));
            
            var size = devices.length;
            platform.log("eWeLink HTTPS API reports that there are a total of [%s] devices registered", size);
            
            if (size == 0) {
               platform.log("As there were no devices were found, all devices have been removed from the platorm's cache. Please regiester your devices using the eWeLink app and restart HomeBridge");
               platform.accessories.clear();
               platform.api.unregisterPlatformAccessories("homebridge-eWeLink", "eWeLink", platform.accessories);
               return;
            }
            
            var devicesFromApi = new Map();
            
            devices.forEach((device) => {
               platform.apiKey = device.apikey;
               devicesFromApi.set(device.deviceid, device);
            });
            
            // Now we compare the cached devices against the web list
            platform.log("Evaluating if devices need to be removed...");
            
            function checkIfDeviceIsStillRegistered(value, deviceId, map) {
               
               var accessory = platform.accessories.get(deviceId);
               
               if (devicesFromApi.has(deviceId)) {
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
                  
                  var accessory = platform.accessories.get(deviceId);
                  var deviceInformationFromWebApi = devicesFromApi.get(deviceId);
                  
                  accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Name, deviceInformationFromWebApi.name);
                  accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.SerialNumber, deviceInformationFromWebApi.extra.extra.mac);
                  accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, deviceInformationFromWebApi.brandName);
                  accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Model, deviceInformationFromWebApi.productModel);
                  accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.FirmwareRevision, deviceInformationFromWebApi.params.fwVersion);
                  let powerState;
                  if ((deviceInformationFromWebApi !== undefined) && (deviceInformationFromWebApi.productModel)) {
                     switch (deviceInformationFromWebApi.productModel) {
                     case 'B1':
                     case 'MINI':
                        powerState = deviceInformationFromWebApi.params.state;
                        break;
                     case 'iFan02':
                        powerState = deviceInformationFromWebApi.params.switches[0].switch;
                        break;
                     case 'AD500--X':
                        powerState = deviceInformationFromWebApi.params.switch;
                     }
                  }
                  if (this.debug) platform.log("::checkIfDeviceIsAlreadyConfigured() " + deviceInformationFromWebApi.name + " is " + powerState);
                  
                  platform.updatePowerStateCharacteristic(deviceId, powerState);
                  
               } else {
                  var deviceToAdd = devicesFromApi.get(deviceId);
                  platform.log('Device [%s], ID : [%s] will be added', deviceToAdd.name, deviceToAdd.deviceid);
                  platform.addAccessory(deviceToAdd);
               }
            }
            
            // Go through the web response to make sure that all the devices that are in the response do exist in the accessories map
            if (devicesFromApi.size > 0) {
               devicesFromApi.forEach(checkIfDeviceIsAlreadyConfigured);
            }
            
            if (this.debug) platform.log("API key retrieved from web service is [%s]", platform.apiKey);
            
         })().catch(function (error) {
            platform.log("Error in intialization");
         });
      }.bind(this));
   }
}

// Function invoked when homebridge tries to restore cached accessory.
// We update the existing devices as part of didFinishLaunching(), as to avoid an additional call to the the HTTPS API.
eWeLink.prototype.configureAccessory = function (accessory) {
   
   this.log(accessory.displayName, "Configure Accessory");
   
   var platform = this;
   accessory.reachable = true;
   
   accessory.on('identify', function (paired, callback) {
      platform.log(accessory.displayName, "Identify!!!");
      callback();
   });
   
   if (accessory.getService(Service.Switch)) {
      
      accessory.getService(Service.Switch).getCharacteristic(Characteristic.On)
         .on('set', function (value, callback) {
            platform.setPowerState(accessory, value);
            callback();
         })
         .on('get', function (callback) {
            platform.getPowerState(accessory);
            callback();
         });
      
   }
   
   this.accessories.set(accessory.context.deviceId, accessory);
   
};

eWeLink.prototype.getStateFromDevice = function (device) {
   if (this.debug) this.log("getStateFromDevice:: ENTER");
   var powerState = 'on';
   if ((device !== undefined) && (device.productModel)) {
      switch (device.productModel) {
      case 'B1':
      case "MINI":
         powerState = device.params.state;
         break;
      case 'iFan02':
         powerState = device.params.switches[0].switch;
         break;
      case 'AD500--X':
         powerState = device.params.switch;
      }
   }
   if (this.debug) this.log("getStateFromDevice:: " + device.name + " is " + powerState);
   if (this.debug) this.log("getStateFromDevice:: EXIT");
   return powerState;
};

// Sample function to show how developer can add accessory dynamically from outside event
eWeLink.prototype.addAccessory = function (device) {
   
   // Here we need to check if it is currently there
   if (this.accessories.get(device.deviceid)) {
      this.log("Not adding [%s] as it already exists in the cache", device.deviceid);
      return;
   }
   
   var platform = this;
   
   if (device.type != 10) {
      this.log("A device with an unknown type was returned. It will be skipped.", device.type);
      return;
   }
   
   this.log("Found Accessory with Name : [%s], Manufacturer : [%s], Status : [%s], Is Online : [%s], API Key: [%s] ", device.name, device.productModel, this.getStateFromDevice(device), device.online, device.apikey);
   
   const accessory = new Accessory(device.name, UUIDGen.generate(device.deviceid.toString()));
   
   accessory.context.deviceId = device.deviceid;
   accessory.context.apiKey = device.apikey;
   
   // if (device.online == 'true') {
   accessory.reachable = true;
   // } else {
   // 	accessory.reachable = false;
   // }
   
   accessory.addService(Service.Switch, device.name)
      .getCharacteristic(Characteristic.On)
      .on('set', function (value, callback) {
         platform.setPowerState(accessory, value);
         callback();
      })
      .on('get', function (callback) {
         platform.getPowerState(accessory);
         callback();
      });
   
   accessory.on('identify', function (paired, callback) {
      platform.log(accessory.displayName, "Identify not supported");
      callback();
   });
   
   accessory.getService(Service.AccessoryInformation).Characteristic(Characteristic.SerialNumber, device.extra.extra.mac);
   accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Manufacturer, device.productModel);
   accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Model, device.extra.extra.model);
   accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.Identify, false);
   accessory.getService(Service.AccessoryInformation).setCharacteristic(Characteristic.FirmwareRevision, device.params.fwVersion);
   
   this.accessories.set(device.deviceid, accessory);
   
   this.api.registerPlatformAccessories("homebridge-eWeLink",
      "eWeLink", [accessory]);
   
};

eWeLink.prototype.getSequence = function () {
   var time_stamp = new Date() / 1000;
   this.sequence = Math.floor(time_stamp * 1000);
   return this.sequence;
};

eWeLink.prototype.updatePowerStateCharacteristic = function (deviceId, state) {
   var platform = this;
   if (platform.debug) platform.log("::updatePowerStateCharacteristic() : ENTER with (deviceId='" + deviceId + "',state='" + state + "')");
   
   // Used when we receive an update from an external source
   var isOn = false;
   var accessory = platform.accessories.get(deviceId);
   if (state == 'on') {
      isOn = true;
   }
   //if (platform.debug) platform.log("::updatePowerStateCharacteristic() : accessory before update: "+JSON.stringify(accessory));
   
   if (platform.debug) platform.log("::updatePowerStateCharacteristic() : Updating recorded Characteristic.On for [%s] to [%s]. No request will be sent to the device.", accessory.context.deviceId, isOn);
   accessory.getService(Service.Switch).setCharacteristic(Characteristic.On, isOn);
   //if (platform.debug) platform.log("::updatePowerStateCharacteristic() : accessory after update: "+JSON.stringify(accessory));
   //platform.updatePowerStateCharacteristic(deviceId, powerState);
   if (platform.debug) platform.log("::updatePowerStateCharacteristic() : EXIT");
};

eWeLink.prototype.getPowerState = function (accessory, callback) {
   var platform = this;
   
   if (this.debug) platform.log("::getPowerState() : ENTER Requesting power state for [%s].", accessory.displayName); //, JSON.stringify(accessory));
   
   (async () => {
      //		const device = await platform.connection.getDevice(accessory.context.deviceId);
      var interestedDevice = null;
      /////////////
      const devices = await platform.connection.getDevices();
      //if (platform.debug) platform.log("::getPowerState() : retrieved all devices, found "+devices.length+" devices");
      
      //if (platform.debug) platform.log("::getPowerState() : Looking for interested device");
      devices.forEach((device) => {
         //			if (platform.debug) platform.log("::getPowerState() : Found : "+JSON.stringify(device));
         //if (platform.debug) platform.log("::getPowerState() : Looking for " + accessory.context.deviceId + ", but found "+device.deviceid);
         if (accessory.context.deviceId == device.deviceid) {
            //if (platform.debug) platform.log("::getPowerState() : found what I was looking for");
            interestedDevice = device;
         }
      });
      /////////////
      let powerState = platform.getStateFromDevice(interestedDevice);
      if (platform.debug) platform.log("::getPowerState() : power state for [%s] is %s", accessory.displayName, powerState);
      this.updatePowerStateCharacteristic(accessory.context.deviceId, powerState);
      if (this.debug) platform.log("::getPowerState() : EXIT");
   })()
   .catch(function (error) {
      platform.log("::getPowerState() : Error in retrieving device\n" + JSON.stringify(error));
   });
};

eWeLink.prototype.setPowerState = function (accessory, isOn, callback) {
   var platform = this;
   if (platform.debug) platform.log("::setPowerState() : ENTER");
   
   var targetState = 'off';
   
   if (isOn == true || isOn == 'on') {
      targetState = 'on';
   }
   
   if (this.debug) platform.log("::setPowerState() : Setting power state to [%s] for device [%s]", targetState, accessory.displayName);
   (async () => {
      const status = await platform.connection.setDevicePowerState(accessory.context.deviceId, targetState);
      if (this.debug) platform.log("::setPowerState() : power state for [%s] is %s", accessory.displayName, JSON.stringify(status));
      //this.updatePowerStateCharacteristic(accessory.context.deviceId, targetState);
      if (platform.debug) platform.log("::setPowerState() : EXIT");
   })().catch(function (error) {
      platform.log("::setPowerState() : Error in retrieving device\n" + JSON.stringify(error));
   });
};

// Sample function to show how developer can remove accessory dynamically from outside event
eWeLink.prototype.removeAccessory = function (accessory) {
   
   this.log('Removing accessory [%s]', accessory.displayName);
   this.accessories.delete(accessory.context.deviceId);
   this.api.unregisterPlatformAccessories('homebridge-eWeLink', 'eWeLink', [accessory]);
};