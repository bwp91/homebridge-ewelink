import platformConsts from '../utils/constants.js';
import { hasProperty } from '../utils/functions.js';

export default class {
  constructor(platform, accessory) {
    // Set up variables from the platform
    this.eveChar = platform.eveChar;
    this.hapChar = platform.api.hap.Characteristic;
    this.hapServ = platform.api.hap.Service;
    this.lang = platform.lang;
    this.log = platform.log;
    this.platform = platform;

    // Set up variables from the accessory
    this.name = accessory.displayName;
    this.accessory = accessory;

    // Set up custom variables for this device type
    const deviceConf = platform.deviceConf[accessory.context.eweDeviceId] || {};
    this.lowBattThreshold = deviceConf.lowBattThreshold
      ? Math.min(deviceConf.lowBattThreshold, 100)
      : platformConsts.defaultValues.lowBattThreshold;

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

    // If the accessory has a leak sensor service then remove it
    if (this.accessory.getService(this.hapServ.LeakSensor)) {
      this.accessory.removeService(this.accessory.getService(this.hapServ.LeakSensor));
    }

    // Add the contact sensor service if it doesn't already exist
    this.service = this.accessory.getService(this.hapServ.ContactSensor);
    if (!this.service) {
      this.service = this.accessory.addService(this.hapServ.ContactSensor);
      this.service.addCharacteristic(this.eveChar.LastActivation);
      this.service.addCharacteristic(this.eveChar.ResetTotal);
      this.service.addCharacteristic(this.eveChar.OpenDuration);
      this.service.addCharacteristic(this.eveChar.ClosedDuration);
      this.service.addCharacteristic(this.eveChar.TimesOpened);
    }

    // Add the set handler to the contact sensor reset total characteristic
    this.service.getCharacteristic(this.eveChar.ResetTotal).onSet(() => {
      this.service.updateCharacteristic(this.eveChar.TimesOpened, 0);
    });

    // Add the battery service if it doesn't already exist
    this.batteryService = this.accessory.getService(this.hapServ.Battery)
      || this.accessory.addService(this.hapServ.Battery);

    // Pass the accessory to Fakegato to set up with Eve
    this.accessory.eveService = new platform.eveService('door', this.accessory, {
      log: () => {},
    });
    this.accessory.eveService.addEntry({
      status: this.service.getCharacteristic(this.hapChar.ContactSensorState).value,
    });

    // Output the customised options to the log
    const normalLogging = this.enableLogging ? 'standard' : 'disable';
    const opts = JSON.stringify({
      logging: this.enableDebugLogging ? 'debug' : normalLogging,
      lowBattThreshold: this.lowBattThreshold,
      showAs: 'default',
    });
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts);
  }

  async externalUpdate(params) {
    try {
      if (hasProperty(params, 'battery') && params.battery !== this.cacheBatt) {
        this.cacheBatt = params.battery;
        if (this.accessory.context.eweUIID === 154) {
          // No scaling needed for this model as provided as a %
          this.cacheBattScaled = this.cacheBatt;
        } else {
          // Scaling needed for UIID 102 as provided as a voltage rather than a %
          this.cacheBattScaled = Math.min(Math.max(this.cacheBatt, 2), 3);
          this.cacheBattScaled = Math.round((this.cacheBattScaled - 2) * 100);
        }

        this.batteryService.updateCharacteristic(this.hapChar.BatteryLevel, this.cacheBattScaled);
        this.batteryService.updateCharacteristic(
          this.hapChar.StatusLowBattery,
          this.cacheBattScaled < this.lowBattThreshold ? 1 : 0,
        );
        if (params.updateSource && this.enableLogging) {
          this.log('[%s] %s [%s%].', this.name, this.lang.curBatt, this.cacheBattScaled);
        }
      }
      if (!params.switch || params.switch === this.cacheState) {
        return;
      }
      this.cacheState = params.switch;
      const newState = params.switch === 'on' ? 1 : 0;
      if (newState === 1) {
        this.service.updateCharacteristic(this.hapChar.ContactSensorState, 1);
        this.accessory.eveService.addEntry({ status: 1 });
        const initialTime = this.accessory.eveService.getInitialTime();
        this.service.updateCharacteristic(
          this.eveChar.LastActivation,
          Math.round(new Date().valueOf() / 1000) - initialTime,
        );
        const newTO = this.service.getCharacteristic(this.eveChar.TimesOpened).value + 1;
        this.service.updateCharacteristic(this.eveChar.TimesOpened, newTO);
      } else {
        this.service.updateCharacteristic(this.hapChar.ContactSensorState, 0);
        this.accessory.eveService.addEntry({ status: 0 });
      }
      if (params.updateSource && this.enableLogging) {
        this.log(
          '[%s] %s [%s].',
          this.name,
          this.lang.curState,
          newState === 0 ? this.lang.contactYes : this.lang.contactNo,
        );
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false);
    }
  }
}
