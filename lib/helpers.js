/* jshint -W014, -W033, esversion: 9 */
/* eslint-disable new-cap */
'use strict'
module.exports = {
  sleep: ms => new Promise(resolve => setTimeout(resolve, ms)),
  hasProperty: (obj, prop) => Object.prototype.hasOwnProperty.call(obj, prop),
  appId: 'oeVkj2lYFGnJu5XUtWisfW4utiN4u9Mq',
  appSecret: '6Nz4n0xA8s8qdxQf2GqurZj2Fs55FUvM',
  httpRetryCodes: ['ENOTFOUND', 'ETIMEDOUT', 'EAI_AGAIN'],
  allowedGroups: ['blind', 'garage', 'garage_two', 'garage_four', 'garage_eachen', 'lock', 'valve', 'valve_two'],
  defaults: {
    inUsePowerThreshold: 0,
    lowBattThreshold: 25,
    sensorTimeLength: 60,
    sensorTimeDifference: 120
  },
  devicesNonLAN: [22, 28, 34, 59, 102, 104],
  devicesSingleSwitch: [1, 5, 6, 14, 15, 22, 24, 27, 32, 36, 44, 59, 104],
  devicesMultiSwitch: [2, 3, 4, 7, 8, 9, 29, 30, 31, 34, 41],
  devicesSingleSwitchOutlet: ['Sonoff Pow', 'S20', 'S26', 'S55'],
  devicesBrightable: [36, 44],
  devicesColourable: [22, 59, 104],
  devicesCTempable: [],
  devicesCurtain: [11],
  devicesSensor: [102],
  devicesThermostat: [15],
  devicesFan: [34],
  devicesDiffuser: [25],
  devicesOutlet: [32],
  devicesCamera: [87],
  devicesUSB: [77],
  devicesSCM: [78],
  devicesRFBridge: [28],
  devicesZBBridge: [66],
  devicesZB: [1000, 1009, 1256, 1770, 2026, 3026],
  paramsToKeep: [
    'battery', 'bright', 'brightness',
    'channel', 'cmd', 'color', 'colorB',
    'colorG', 'colorR', 'current',
    'currentHumidity', 'currentTemperature',
    'humidity', 'key', 'lightbright',
    'lightswitch', 'lightRcolor',
    'lightGcolor', 'lightBcolor', 'lock',
    'ltype', 'mainSwitch', 'mode', 'motion',
    'online', 'power', 'rfChl', 'rfList',
    'rfTrig', 'sensorType', 'setclose', 'state',
    'switch', 'switches', 'temperature',
    'trigTime', 'type', 'voltage', 'zyx_mode'
  ],
  defaultMultiSwitchOff: [
    {
      switch: 'off',
      outlet: 0
    },
    {
      switch: 'off',
      outlet: 1
    },
    {
      switch: 'off',
      outlet: 2
    },
    {
      switch: 'off',
      outlet: 3
    }
  ],
  defaultCurtainCache: {
    cacheCurrentPosition: 0
  },
  defaultBlindCache: {
    cacheCurrentPosition: 0,
    cachePositionState: 2,
    cacheTargetPosition: 0
  },
  defaultGarageCache: {
    cacheCurrentDoorState: 1,
    cacheTargetDoorState: 1
  },
  defaultGarageTwoCache: {
    cacheOneCurrentDoorState: 1,
    cacheOneTargetDoorState: 1,
    cacheTwoCurrentDoorState: 1,
    cacheTwoTargetDoorState: 1
  },
  defaultGarageFourCache: {
    cacheStates: [
      {
        cacheCurrentDoorState: 1,
        cacheTargetDoorState: 1
      },
      {
        cacheCurrentDoorState: 1,
        cacheTargetDoorState: 1
      },
      {
        cacheCurrentDoorState: 1,
        cacheTargetDoorState: 1
      },
      {
        cacheCurrentDoorState: 1,
        cacheTargetDoorState: 1
      }
    ]
  },
  chansFromUiid: {
    1: 1, // "SOCKET"                                  \\ 20, MINI, BASIC, S26
    2: 2, // "SOCKET_2"                                \\
    3: 3, // "SOCKET_3"                                \\
    4: 4, // "SOCKET_4",                               \\
    5: 1, // "SOCKET_POWER"                            \\
    6: 1, // "SWITCH"                                  \\ T1 1C, TX1C
    7: 2, // "SWITCH_2"                                \\ T1 2C, TX2C
    8: 3, // "SWITCH_3"                                \\ T1 3C, TX3C
    9: 4, // "SWITCH_4"                                \\
    10: 0, // "OSPF"                                   \\
    11: 1, // "CURTAIN"                                \\ King Q4 Cover
    12: 0, // "EW-RE"                                  \\
    13: 0, // "FIREPLACE"                              \\
    14: 1, // "SWITCH_CHANGE"                          \\
    15: 1, // "THERMOSTAT"                             \\ TH10, TH16
    16: 0, // "COLD_WARM_LED"                          \\
    17: 0, // "THREE_GEAR_FAN"                         \\
    18: 0, // "SENSORS_CENTER"                         \\
    19: 0, // "HUMIDIFIER"                             \\
    22: 1, // "RGB_BALL_LIGHT"                         \\ B1, B1_R2
    23: 0, // "NEST_THERMOSTAT"                        \\
    24: 1, // "GSM_SOCKET"                             \\
    25: 0, // "AROMATHERAPY",                          \\ Diffuser,  Komeito 1515-X
    26: 0, // "RuiMiTeWenKongQi"                       \\
    27: 1, // "GSM_UNLIMIT_SOCKET"                     \\
    28: 1, // "RF_BRIDGE"                              \\ RFBridge, RF_Bridge
    29: 2, // "GSM_SOCKET_2"                           \\
    30: 3, // "GSM_SOCKET_3"                           \\
    31: 4, // "GSM_SOCKET_4"                           \\
    32: 1, // "POWER_DETECTION_SOCKET"                 \\ Pow_R2 POW
    33: 0, // "LIGHT_BELT",                            \\
    34: 4, // "FAN_LIGHT"                              \\ iFan02, iFan
    35: 0, // "EZVIZ_CAMERA",                          \\
    36: 1, // "SINGLE_CHANNEL_DIMMER_SWITCH"           \\ KING-M4
    38: 0, // "HOME_KIT_BRIDGE",                       \\
    40: 0, // "FUJIN_OPS"                              \\
    41: 4, // "CUN_YOU_DOOR"                           \\
    42: 0, // "SMART_BEDSIDE_AND_NEW_RGB_BALL_LIGHT"   \\
    43: 0, // "?"                                      \\
    44: 1, // "SNOFF_LIGHT"                            \\ D1
    45: 0, // "DOWN_CEILING_LIGHT"                     \\
    46: 0, // "AIR_CLEANER"                            \\
    49: 0, // "MACHINE_BED"                            \\
    51: 0, // "COLD_WARM_DESK_LIGHT"                   \\
    52: 0, // "DOUBLE_COLOR_DEMO_LIGHT"                \\
    53: 0, // "ELECTRIC_FAN_WITH_LAMP"                 \\
    55: 0, // "SWEEPING_ROBOT"                         \\
    56: 0, // "RGB_BALL_LIGHT_4"                       \\
    57: 0, // "MONOCHROMATIC_BALL_LIGHT"               \\
    59: 1, // "MUSIC_LIGHT_BELT"                       \\ L1
    60: 0, // "NEW_HUMIDIFIER"                         \\
    61: 0, // "KAI_WEI_ROUTER"                         \\
    62: 0, // "MEARICAMERA"                            \\
    64: 0, // "HeatingTable"                           \\
    65: 0, // "CustomCamera"                           \\
    66: 0, // "ZIGBEE_MAIN_DEVICE"                     \\
    67: 0, // "RollingDoor"                            \\
    68: 0, // "KOOCHUWAH"                              \\ a whhaaaaat?
    69: 0, // "ATMOSPHERE_LAMP"                        \\
    76: 0, // "YI_GE_ER_LAMP"                          \\
    77: 4, // "SINGLE_SOCKET_MULTIPLE"                 \\ (1 socket device using data structure of four :()
    78: 4, // "SINGLE_SWITCH_MULTIPLE"                 \\ (1 switch device using data structure of four :()
    79: 0, // "CHRISTMAS_LIGHT"                        \\
    80: 0, // "HANYUAN_AIR_CONDITION"                  \\
    81: 1, // "GSM_SOCKET_NO_FLOW"                     \\
    82: 2, // "GSM_SOCKET_2_NO_FLOW"                   \\
    83: 3, // "GSM_SOCKET_3_NO_FLOW"                   \\
    84: 4, // "GSM_SOCKET_4_NO_FLOW"                   \\
    86: 0, // "CLEAR_BOOT"                             \\
    87: 0, // "EWELINK_IOT_CAMERA"                     \\ GK-200MP2B
    88: 0, // "YK_INFRARED"                            \\
    89: 0, // "SMART_OPEN_MACHINE"                     \\
    90: 0, // "GSM_RFBridge"                           \\
    91: 0, // "ROLLING_DOOR_91"                        \\
    93: 0, // "HTHD_AIR_CLEANER"                       \\
    94: 0, // "YIAN_ELECTRIC_PROTECT"                  \\
    98: 0, // "DOORBELL_RFBRIDGE"                      \\
    102: 1, // "DOOR_MAGNETIC"                         \\ OPL-DMA, DW2
    103: 0, // "WOTEWODE_TEM_LIGHT"                    \\
    104: 1, // "WOTEWODE_RGB_TEM_LIGHT"                \\
    107: 0, // "GSM_SOCKET_NO_FLOW"                    \\
    109: 0, // "YK_INFRARED_2"                         \\
    1000: 1, // "ZIGBEE_WIRELESS_SWITCH"               \\
    1001: 0, // "BLADELESS_FAN"                        \\
    1002: 0, // "NEW_HUMIDIFIER"                       \\
    1003: 0, // "WARM_AIR_BLOWER"                      \\
    1256: 1, // "ZIGBEE_SINGLE_SWITCH"                 \\
    1770: 1, // "ZIGBEE_TEMPERATURE_SENSOR"            \\
    2026: 1, // "ZIGBEE_MOBILE_SENSOR"                 \\
    2256: 2, // "ZIGBEE_SWITCH_2"                      \\
    3026: 1, // "ZIGBEE_DOOR_AND_WINDOW_SENSOR"        \\
    3256: 3, // "ZIGBEE_SWITCH_3"                      \\
    4026: 1, // "ZIGBEE_WATER_SENSOR"                  \\
    4256: 4 // "ZIGBEE_SWITCH_4"                      \\
  }
}
