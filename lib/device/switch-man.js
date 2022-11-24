import { hasProperty } from '../utils/functions.js';

export default class {
  constructor(platform, accessory) {
    // Set up variables from the platform
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
    this.timeouts = {
      1: false,
      2: false,
      3: false,
      4: false,
      5: false,
      6: false,
      7: false,
      8: false,
      9: false,
    };

    // Add the stateless switch service if it doesn't already exist
    this.service1 = this.accessory.getService('Channel 1')
      || this.accessory.addService(this.hapServ.StatelessProgrammableSwitch, 'Channel 1', 'channel1');
    this.service2 = this.accessory.getService('Channel 2')
      || this.accessory.addService(this.hapServ.StatelessProgrammableSwitch, 'Channel 2', 'channel2');
    this.service3 = this.accessory.getService('Channel 3')
      || this.accessory.addService(this.hapServ.StatelessProgrammableSwitch, 'Channel 3', 'channel3');
    this.service4 = this.accessory.getService('Channel 4')
      || this.accessory.addService(this.hapServ.StatelessProgrammableSwitch, 'Channel 4', 'channel4');
    this.service5 = this.accessory.getService('Channel 5')
      || this.accessory.addService(this.hapServ.StatelessProgrammableSwitch, 'Channel 5', 'channel5');
    this.service6 = this.accessory.getService('Channel 6')
      || this.accessory.addService(this.hapServ.StatelessProgrammableSwitch, 'Channel 6', 'channel6');
    this.service7 = this.accessory.getService('Channel 7')
      || this.accessory.addService(this.hapServ.StatelessProgrammableSwitch, 'Channel 7', 'channel7');
    this.service8 = this.accessory.getService('Channel 8')
      || this.accessory.addService(this.hapServ.StatelessProgrammableSwitch, 'Channel 8', 'channel8');
    this.service9 = this.accessory.getService('Channel 9')
      || this.accessory.addService(this.hapServ.StatelessProgrammableSwitch, 'Channel 9', 'channel9');

    // Output the customised options to the log
    const normalLogging = this.enableLogging ? 'standard' : 'disable';
    const opts = JSON.stringify({
      logging: this.enableDebugLogging ? 'debug' : normalLogging,
    });
    this.log('[%s] %s %s.', this.name, this.lang.devInitOpts, opts);
  }

  async externalUpdate(params) {
    try {
      if (
        hasProperty(params, 'outlet')
        && [0, 1, 2, 3, 4, 5, 6, 7, 8].includes(params.outlet)
        && params.actionTime
        && !this.timeouts[params.outlet + 1]
      ) {
        this.timeouts[params.outlet + 1] = true;
        setTimeout(() => {
          this.timeouts[params.outlet + 1] = false;
        }, 1000);
        const timeDiff = (new Date().getTime() - Date.parse(params.actionTime)) / 1000;
        if (timeDiff < 5) {
          const service = this[`service${params.outlet + 1}`];
          service.updateCharacteristic(this.hapChar.ProgrammableSwitchEvent, params.key);
          if (params.updateSource && this.enableLogging) {
            const doubleLong = params.key === 1 ? this.lang.buttonDouble : this.lang.buttonLong;
            const textLabel = params.key === 0 ? this.lang.buttonSingle : doubleLong;
            if (this.enableLogging) {
              this.log('[%s] [%s] %s [%s].', this.name, service.displayName, this.lang.curState, textLabel);
            }
          }
        }
      }
    } catch (err) {
      this.platform.deviceUpdateError(this.accessory, err, false);
    }
  }
}
