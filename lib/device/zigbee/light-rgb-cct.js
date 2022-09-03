import platformConsts from '../../utils/constants.js';

export default class {
  constructor(platform, accessory) {
    // Set up variables from the platform
    this.hapChar = platform.api.hap.Characteristic;
    this.hapErr = platform.api.hap.HapStatusError;
    this.hapServ = platform.api.hap.Service;
    this.lang = platform.lang;
    this.log = platform.log;
    this.platform = platform;

    // Set up variables from the accessory
    this.name = accessory.displayName;
    this.accessory = accessory;

    // Set up custom variables for this device type
    const deviceConf = platform.deviceConf[accessory.context.eweDeviceId] || {};
    this.brightStep = deviceConf.brightnessStep
      ? Math.min(deviceConf.brightnessStep, 100)
      : platformConsts.defaultValues.brightnessStep;

    // Set the correct logging variables for this accessory
    switch (deviceConf.overrideLogging) {
      case 'standard':
        this.enableLogging = true;
        this.enableDebugLogging = false;
        break;
      case 'debug':
        this.enableLogging = true;
        this.enableDebugLogging = true;
        break;
      case 'disable':
        this.enableLogging = false;
        this.enableDebugLogging = false;
        break;
      default:
        this.enableLogging = !platform.config.disableDeviceLogging;
        this.enableDebugLogging = platform.config.debug;
        break;
    }

    // Add the lightbulb service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.Lightbulb)
      || this.accessory.addService(this.hapServ.Lightbulb);

    // Add the get/set handler to the lightbulb on/off characteristic
    this.service
      .getCharacteristic(this.hapChar.On)
      .onGet(() => {
        if (this.isOnline) {
          return this.service.getCharacteristic(this.hapChar.On).value;
        }
        throw new this.hapErr(-70402);
      })
      .onSet(async (value) => {
        this.internalStateUpdate(value);
      });

    // Output the customised options to the log
    const normalLogging = this.enableLogging ? 'standard' : 'disable';
    const opts = JSON.stringify({
      brightnessStep: this.brightStep,
      logging: this.enableDebugLogging ? 'debug' : normalLogging,
    });
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts);
  }

  async internalStateUpdate(value) {
    try {
      const newValue = value ? 'on' : 'off';
      await this.platform.sendDeviceUpdate(this.accessory, {
        switch: newValue,
      });
      this.cacheState = newValue;
      if (this.enableLogging) {
        this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState);
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, true);
      setTimeout(() => {
        this.service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on');
      }, 2000);
      throw new this.hapErr(-70402);
    }
  }

  async externalUpdate(params) {
    try {
      if (params.switch && params.switch !== this.cacheState) {
        this.cacheState = params.switch;
        this.service.updateCharacteristic(this.hapChar.On, this.cacheState === 'on');
        if (params.updateSource && this.enableLogging) {
          this.log('[%s] %s [%s].', this.name, this.lang.curState, this.cacheState);
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false);
    }
  }

  markStatus(isOnline) {
    this.isOnline = isOnline;
  }
}
