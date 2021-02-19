/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'

module.exports = {
  defaultConfig: {
    name: 'eWeLink',
    countryCode: '',
    username: '',
    password: '',
    mode: 'auto',
    disableDeviceLogging: false,
    debug: false,
    debugFakegato: false,
    disablePlugin: false,
    singleDevices: [],
    multiDevices: [],
    outletDevices: [],
    lightDevices: [],
    thDevices: [],
    fanDevices: [],
    sensorDevices: [],
    groups: [],
    bridgeSensors: [],
    ignoredDevices: [],
    platform: 'eWeLink'
  },

  defaultValues: {
    inUsePowerThreshold: 0,
    lowBattThreshold: 25,
    sensorTimeLength: 60,
    sensorTimeDifference: 120,
    offset: 0,
    operationTime: 100,
    mode: 'auto',
    bulbModel: 'bulbB02FA60',
    brightnessStep: 1,
    adaptiveLightingShift: 0
  },

  minValues: {
    inUsePowerThreshold: 0,
    lowBattThreshold: 5,
    sensorTimeLength: 1,
    sensorTimeDifference: 10,
    operationTime: 20,
    brightnessStep: 1,
    adaptiveLightingShift: 0
  },

  messages: {
    cantReadPacket: 'LAN message received could not be read as',
    cantParsePacket: 'Could not parse DNS packet as',
    cfgDef: 'is not a valid number so using default of',
    cfgIgn: 'is not configured correctly so ignoring',
    cfgIgnItem: 'has an invalid entry which will be ignored',
    cfgItem: 'Config entry',
    cfgLow: 'is set too low so increasing to',
    cfgRmv: 'is unused and can be removed',
    cfgQts: 'should not have quotes around its entry',
    complete: '✓ Setup complete',
    devAdd: 'has been added to Homebridge',
    devInit: 'initialised and',
    devInitOpts: 'initialising with options',
    devNewNotAdd: 'restart Homebridge to add new device, failed to add automatically as',
    devNoAPIKey: 'cannot retrieve device API key',
    devNotAdd: 'could not be added to Homebridge as',
    devNotConf: 'could not be configured as',
    devNotFound: 'device not found in eWeLink',
    devNotInit: 'could not be initialised as',
    devNotConfLAN: 'device not configurable via LAN mode',
    devNotReachLAN: 'device not reachable via LAN mode',
    devNotRf: 'could not be refreshed as',
    devNotRemove: 'could not be removed from Homebridge as',
    devNotSup: 'has not been added as it is not supported',
    devNotSupYet: 'has not been added as it is not supported, please make a GitHub issue',
    devNotUpd: 'device update failed as',
    devRemove: 'has been removed from Homebridge',
    disabled: 'To change this, set disablePlugin to false',
    disabling: 'Disabling plugin',
    eweError: 'An eWeLink error [500] occured, retrying in 30 seconds',
    foundWithIP: 'found locally with IP',
    hostReceived: 'HTTP API host received',
    httpRetry: 'Unable to reach eWeLink, retrying in 30 seconds',
    identify: 'identify button pressed',
    initialised: 'initialised. Syncing with eWeLink',
    lanDisabled: 'LAN mode is disabled',
    lanNotSup: 'LAN mode is not supported for this device',
    lanUnreachable: 'LAN mode unavailable as unreachable',
    lanUnsupported: 'LAN mode unavailable as not supported',
    missingCC: 'eWeLink country code missing from configuration',
    missingCreds: 'eWeLink credentials missing from configuration',
    missingPW: 'eWeLink password missing from configuration',
    missingUN: 'eWeLink username missing from configuration',
    newRegionRec: 'New HTTP API host received',
    noAuthRec: 'No auth token received',
    noRegion: 'Server did not respond with a region',
    noRegionRec: 'No valid region received',
    noWSHost: 'Server did not respond with a web socket host',
    recNew: 'receiving update for new device',
    repOffline: 'reported [offline]',
    repOnline: 'reported [online]',
    revertWS: 'reverting to web socket as',
    sendGetHost: 'Sending HTTP getHost() request',
    sendLogin: 'Sending HTTP login() request',
    sonoffCamera: 'see the homebridge-ewelink wiki for details to enable the camera',
    stoppedLAN: 'LAN monitoring gracefully stopped',
    stoppedWS: 'Web socket gracefully closed',
    unreachable: 'it is unreachable',
    unsupDev: 'has an unsupported device type',
    updRec: 'receiving update',
    updReq: 'requesting current status',
    updSend: 'sending update',
    viaLAN: 'via LAN',
    viaWS: 'via WS',
    wsHostRec: 'Web socket host received',
    wsLogin: 'Sending WS login request',
    wsLoginErr: 'Unknown WS parameters received',
    wsLoginError: 'WS login failed as',
    wsLoginSuccess: 'WS login successful',
    wsPingError: 'Cound not send WS ping as',
    wsRec: 'WS message received',
    wsReconnect: 'Web socket closed and will try to reconnect in 5 seconds',
    wsRef: 'Refreshing WS connection',
    wsRefFail: 'Refreshing WS connection failed as',
    wsResend: 'Request will be sent when WS has reconnected',
    wsUnkAct: 'WS message received has unknown action',
    wsUnkCmd: 'WS unknown command received',
    wsUnkRes: 'Unknown WS response'
  },

  welcomeMessages: [
    "Don't forget to ☆ this plugin on GitHub if you're finding it useful!",
    'Have a feature request? Visit http://bit.ly/hb-ewelink-issues to ask!',
    'Interested in sponsoring this plugin? https://github.com/sponsors/bwp91',
    "Join the plugin's Discord community! https://discord.gg/cMGhNtZ3tW",
    'Thanks for using this plugin, I hope you find it helpful!',
    'This plugin has been made with ♥ by bwp91 from the UK!'
  ],

  appId: 'oeVkj2lYFGnJu5XUtWisfW4utiN4u9Mq',

  appSecret: '6Nz4n0xA8s8qdxQf2GqurZj2Fs55FUvM',

  httpRetryCodes: ['ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN'],

  allowed: {
    singleDevices: ['deviceId', 'showAsOutlet', 'ipAddress', 'overrideDisabledLogging'],
    multiDevices: ['deviceId', 'hideChannels', 'ipAddress', 'overrideDisabledLogging'],
    outletDevices: [
      'deviceId', 'showAsSwitch', 'inUsePowerThreshold', 'ipAddress',
      'overrideDisabledLogging'
    ],
    lightDevices: [
      'deviceId', 'bulbModel', 'brightnessStep', 'adaptiveLightingShift',
      'overrideDisabledLogging'
    ],
    thDevices: ['deviceId', 'hideSwitch', 'offset', 'overrideDisabledLogging'],
    fanDevices: ['deviceId', 'hideLight', 'overrideDisabledLogging'],
    sensorDevices: [
      'deviceId', 'lowBattThreshold', 'hideLongDouble', 'scaleBattery',
      'sensorTimeDifference', 'overrideDisabledLogging'
    ],
    groupTypes: [
      'blind', 'garage', 'garage_two', 'garage_four', 'garage_eachen', 'lock',
      'sensor_leak', 'switch_valve', 'tap', 'tap_two', 'thermostat', 'valve', 'valve_two',
      'valve_four'
    ],
    modes: ['auto', 'wan', 'lan'],
    obstructs: ['garage', 'garage_eachen'],
    setups: ['oneSwitch', 'twoSwitch'],
    sensors: ['water', 'smoke', 'co', 'co2', 'contact', 'occupancy', 'motion'],
    bulbModel: ['bulbB02BA60', 'bulbB02FA60', 'bulbB02FST64']
  },

  devices: {
    lan: [1, 2, 3, 4, 5, 6, 7, 8, 9, 32, 77, 78],
    singleSwitch: [1, 5, 6, 14, 15, 22, 24, 27, 32, 36, 44, 59, 104],
    multiSwitch: [2, 3, 4, 7, 8, 9, 29, 30, 31, 34, 41],
    singleSwitchOutlet: ['Sonoff Pow', 'S20', 'S26', 'S26R1', 'S55', 'S55R1'],
    brightable: [36, 44],
    colourable: [22, 59, 104],
    cTempable: [103],
    curtain: [11],
    sensorContact: [102],
    sensorAmbient: [15],
    thermostat: [127],
    fan: [34],
    diffuser: [25],
    outlet: [32],
    camera: [87],
    eWeCamera: [65],
    usb: [77],
    scm: [78],
    rfBridge: [28],
    zbBridge: [66],
    zbSwitchStateless: [1000],
    zbSwitchSingle: [1009, 1256],
    zbLightDimmer: [1257],
    zbSensorAmbient: [1770],
    zbSensorMotion: [2026],
    zbSensorContact: [3026]
  },

  paramsToKeep: [
    'battery', 'bright', 'brightness', 'channel', 'cmd', 'color', 'colorB', 'colorG',
    'colorR', 'current', 'currentHumidity', 'currentTemperature', 'humidity', 'key',
    'lightbright', 'lightswitch', 'lightRcolor', 'lightGcolor', 'lightBcolor', 'lock',
    'ltype', 'mainSwitch', 'mode', 'motion', 'online', 'power', 'rfChl', 'rfList',
    'rfTrig', 'sensorType', 'setclose', 'state', 'switch', 'switches', 'targetTemp',
    'temperature', 'tempScale', 'trigTime', 'type', 'voltage', 'white', 'workMode',
    'workState', 'zyx_mode'
  ],

  eve: {
    currentConsumption: 'E863F10D-079E-48FF-8F27-9C2605A29F52',
    totalConsumption: 'E863F10C-079E-48FF-8F27-9C2605A29F52',
    voltage: 'E863F10A-079E-48FF-8F27-9C2605A29F52',
    electricCurrent: 'E863F126-079E-48FF-8F27-9C2605A29F52',
    resetTotal: 'E863F112-079E-48FF-8F27-9C2605A29F52',
    lastActivation: 'E863F11A-079E-48FF-8F27-9C2605A29F52'
  },

  defaultMultiSwitchOff: [
    { switch: 'off', outlet: 0 },
    { switch: 'off', outlet: 1 },
    { switch: 'off', outlet: 2 },
    { switch: 'off', outlet: 3 }
  ],

  chansFromUiid: {
    1: 1, // "SOCKET" (20, MINI, BASIC, S26)
    2: 2, // "SOCKET_2"
    3: 3, // "SOCKET_3"
    4: 4, // "SOCKET_4"
    5: 1, // "SOCKET_POWER"
    6: 1, // "SWITCH" (T1 1C, TX1C)
    7: 2, // "SWITCH_2" (T1 2C, TX2C)
    8: 3, // "SWITCH_3" (T1 3C, TX3C)
    9: 4, // "SWITCH_4"
    10: 0, // "OSPF"
    11: 1, // "CURTAIN" (King Q4 Cover)
    12: 0, // "EW-RE"
    13: 0, // "FIREPLACE"
    14: 1, // "SWITCH_CHANGE"
    15: 1, // "THERMOSTAT" (TH10, TH16)
    16: 0, // "COLD_WARM_LED"
    17: 0, // "THREE_GEAR_FAN"
    18: 0, // "SENSORS_CENTER"
    19: 0, // "HUMIDIFIER"
    22: 1, // "RGB_BALL_LIGHT" (B1, B1_R2)
    23: 0, // "NEST_THERMOSTAT"
    24: 1, // "GSM_SOCKET"
    25: 0, // "AROMATHERAPY" (Diffuser, Komeito 1515-X)
    26: 0, // "RuiMiTeWenKongQi"
    27: 1, // "GSM_UNLIMIT_SOCKET"
    28: 1, // "RF_BRIDGE" (RFBridge, RF_Bridge)
    29: 2, // "GSM_SOCKET_2"
    30: 3, // "GSM_SOCKET_3"
    31: 4, // "GSM_SOCKET_4"
    32: 1, // "POWER_DETECTION_SOCKET" (POW, Pow_R2)
    33: 0, // "LIGHT_BELT",
    34: 4, // "FAN_LIGHT" (iFan02, iFan)
    35: 0, // "EZVIZ_CAMERA",
    36: 1, // "SINGLE_CHANNEL_DIMMER_SWITCH" (KING-M4)
    38: 0, // "HOME_KIT_BRIDGE",
    40: 0, // "FUJIN_OPS"
    41: 4, // "CUN_YOU_DOOR"
    42: 0, // "SMART_BEDSIDE_AND_NEW_RGB_BALL_LIGHT"
    43: 0, // "?"
    44: 1, // "SNOFF_LIGHT" (D1)
    45: 0, // "DOWN_CEILING_LIGHT"
    46: 0, // "AIR_CLEANER"
    49: 0, // "MACHINE_BED"
    51: 0, // "COLD_WARM_DESK_LIGHT"
    52: 0, // "DOUBLE_COLOR_DEMO_LIGHT"
    53: 0, // "ELECTRIC_FAN_WITH_LAMP"
    55: 0, // "SWEEPING_ROBOT"
    56: 0, // "RGB_BALL_LIGHT_4"
    57: 0, // "MONOCHROMATIC_BALL_LIGHT"
    59: 1, // "MUSIC_LIGHT_BELT" (L1)
    60: 0, // "NEW_HUMIDIFIER"
    61: 0, // "KAI_WEI_ROUTER"
    62: 0, // "MEARICAMERA"
    64: 0, // "HeatingTable"
    65: 0, // "CustomCamera" (eWeLink Camera App)
    66: 0, // "ZIGBEE_MAIN_DEVICE"
    67: 0, // "RollingDoor"
    68: 0, // "KOOCHUWAH"
    69: 0, // "ATMOSPHERE_LAMP"
    76: 0, // "YI_GE_ER_LAMP"
    77: 4, // "SINGLE_SOCKET_MULTIPLE" (1 socket device using data structure of four :()
    78: 4, // "SINGLE_SWITCH_MULTIPLE" (1 switch device using data structure of four :()
    79: 0, // "CHRISTMAS_LIGHT"
    80: 0, // "HANYUAN_AIR_CONDITION"
    81: 1, // "GSM_SOCKET_NO_FLOW"
    82: 2, // "GSM_SOCKET_2_NO_FLOW"
    83: 3, // "GSM_SOCKET_3_NO_FLOW"
    84: 4, // "GSM_SOCKET_4_NO_FLOW"
    86: 0, // "CLEAR_BOOT"
    87: 0, // "EWELINK_IOT_CAMERA" (GK-200MP2B)
    88: 0, // "YK_INFRARED"
    89: 0, // "SMART_OPEN_MACHINE"
    90: 0, // "GSM_RFBridge"
    91: 0, // "ROLLING_DOOR_91"
    93: 0, // "HTHD_AIR_CLEANER"
    94: 0, // "YIAN_ELECTRIC_PROTECT"
    98: 0, // "DOORBELL_RFBRIDGE"
    102: 1, // "DOOR_MAGNETIC" (OPL-DMA, DW2)
    103: 1, // "WOTEWODE_TEM_LIGHT" (B02-F)
    104: 1, // "WOTEWODE_RGB_TEM_LIGHT"
    107: 0, // "GSM_SOCKET_NO_FLOW"
    109: 0, // "YK_INFRARED_2"
    127: 1, // "GTTA127"
    1000: 1, // "ZIGBEE_WIRELESS_SWITCH"
    1001: 0, // "BLADELESS_FAN"
    1002: 0, // "NEW_HUMIDIFIER"
    1003: 0, // "WARM_AIR_BLOWER"
    1009: 1, // "" (Some sort of single switch device)
    1256: 1, // "ZIGBEE_SINGLE_SWITCH"
    1257: 1, // "ZigbeeWhiteLight"
    1770: 1, // "ZIGBEE_TEMPERATURE_SENSOR"
    2026: 1, // "ZIGBEE_MOBILE_SENSOR"
    2256: 2, // "ZIGBEE_SWITCH_2"
    3026: 1, // "ZIGBEE_DOOR_AND_WINDOW_SENSOR"
    3256: 3, // "ZIGBEE_SWITCH_3"
    4026: 1, // "ZIGBEE_WATER_SENSOR"
    4256: 4 // "ZIGBEE_SWITCH_4"
  }
}
