export default class {
  constructor(platform, accessory, devicesInHB) {
    // Set up variables from the platform
    this.hapChar = platform.api.hap.Characteristic;
    this.hapServ = platform.api.hap.Service;
    this.platform = platform;

    // Set up variables from the accessory
    this.accessory = accessory;

    // Set up custom variables for this device type
    const garageId = platform.obstructSwitches[accessory.context.eweDeviceId];

    // Check the garage door exists in Homebridge
    const uuid = platform.api.hap.uuid.generate(`${garageId}SWX`);
    if (!devicesInHB.has(uuid)) {
      // Can't find garage so throw an error
      throw new Error(platform.lang.noGarageForOD);
    } else {
      // Get the garage door accessory
      this.gService = devicesInHB.get(uuid).getService(this.hapServ.GarageDoorOpener);
    }
  }

  async externalUpdate(params) {
    try {
      if (!params.switch || params.switch === this.cacheState || !this.gService) {
        return;
      }
      this.gService.updateCharacteristic(this.hapChar.ObstructionDetected, params.switch === 'on');
      this.cacheState = params.switch;
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false);
    }
  }
}
