# homebridge-ewelink-max

Homebridge plugin to control Sonoff relays with OEM firmware. It uses the same API as the iOS app to communicate with your devices.

The platform will dynamically add/remove devices based on what is configured in your eWeLink account.

It has been tested with the [Sonoff basic](http://sonoff.itead.cc/en/products/sonoff/sonoff-basic) relays. I have performed testing with up to two relays associated to my account.

The plugin will only support one eWeLink account.

It is possible to continue to use the OEM functionality (eWeLink app, Google Home integration); this plugin requires no modification to the relay's firmware.

## Why max?

This is a fork of [homebridge-ewelink](https://github.com/gbro115/homebridge-ewelink), which is not being actively updated. There is another package named [homebridge-ewelin-plus](https://www.npmjs.com/package/homebridge-ewelink-plus) which is not updated for 6 months at the time of writing. The name is inspired by Apple's naming convention.

This fork have the following notable changes / improvements:

* Support login with phone number / email and password, which save your time from obtaining the authentication token with Charles once in a while.
* Support sending heartbeat on the WebSocket connection, which greatly reduce the interval of reconnects, hence better stability.

## Shortcomings

The plugin uses the same credentials as the eWeLink app. In order to obtain the API URLs, you'll need to use Charles to inspect the traffic and grab the value from the API response. See below for information on how to obtain these value.

Also, the code is of suboptimal quality. It was a quick-and-dirty plugin; feel free to contribute & improve.

## Steps to install / configure

*Assuming that you've already downloaded the eWeLink app on your iOS device & have configured it:*

1) Install the plugin
```
sudo npm -g install homebridge-ewelink-max
```

2) Add to the platforms[] section of config.json. Steps for obtaining the values for apiHost and webSocketApi can be found below.

  * `phoneNumber` - The login phone number of your ewelink account
  * `email` - The login email of your ewelink account
  * `password` - Your ewelink account login password
  * `imei` - This can be any valid UUID (or maybe any random string will do)
  * `apiHost` - The ewelink api host (different depends on your region)
  * `webSocketApi` - The ewelink WebSocket api host (different depends on your region)

3) Restart Homebridge

### Sample config.json

```
{
    "bridge": {
        "name": "Homebridge",
        "username": "XX:XX:XX:XX:XX:XX",
        "port": 51826,
        "pin": "123-45-678"
    },
    
    "description": "Your description here",

    "accessories": [
    ],

    "platforms": [
        {
        "platform" : "eWeLink",
        "name" : "eWeLink",
        "phoneNumber" : "+12345678901",
        "password" : "your-login-password",
        "imei" : "01234567-89AB-CDEF-0123-456789ABCDEF",
        "apiHost" : "us-api.coolkit.cc:8080",
        "webSocketApi" : "us-long.coolkit.cc"
        }
    ]
}
```

### Obtaining the API URL using Charles

[Charles](https://www.charlesproxy.com/) allows us to watch the data being exchanged between the eWeLink iOS app (Android is untested) and the server endpoint.

1) Download and install the eWeLink app to your device
2) Ensure your Sonoff devices are registered and working with the native app
3) Ensure the app is logged in to your account
4) Return back to your device's home screen

With Charles configured and listening for connections from your iOS device, open up the eWeLink app from the home screen. As part of the loading of the app, you'll see requests to the following URLs (or similar, depending on your region):

```
https://us-api.coolkit.cc:8080/api/user/device?apiKey=XXXX&appVersion=X.X.X&getTags=1&imei=XXXX&lang=en&model=XXXX&os=ios&romVersion=X.X.X&version=X

https://us-ota.coolkit.cc:8080/otaother/app
```

API URLs are shown in this request. You need to use the URL in webSocketApi and apiHost

### A note on login session

An authentication token is generated every time your device's app logs in to the eWeLink service. Based on my limited testing, the session seems to persist for quite some time.

You can only have one authentication token per user account. 

If you login with the app, you'll need to restart homebridge to get a new authentication token for it to work.

## Troubleshooting

I've attempted to make the logging as useful as possible. If you have any suggestions, please open an issue on GitHub.

## Sample logging

```
[12/13/2017, 9:39:05 PM] [eWeLink] A total of [1] accessories were loaded from the local cache
[12/13/2017, 9:39:05 PM] [eWeLink] Requesting a list of devices from eWeLink HTTPS API at [https://us-api.coolkit.cc:8080]
[12/13/2017, 9:39:06 PM] [eWeLink] eWeLink HTTPS API reports that there are a total of [1] devices registered
[12/13/2017, 9:39:06 PM] [eWeLink] Evaluating if devices need to be removed...
[12/13/2017, 9:39:06 PM] [eWeLink] Verifying that all cached devices are still registered with the API. Devices that are no longer registered with the API will be removed.
[12/13/2017, 9:39:06 PM] [eWeLink] Device [Fan] is regeistered with API. Nothing to do.
[12/13/2017, 9:39:06 PM] [eWeLink] Evaluating if new devices need to be added...
[12/13/2017, 9:39:06 PM] [eWeLink] Device with ID [XXXXXXX] is already configured. Ensuring that the configuration is current.
[12/13/2017, 9:39:06 PM] [eWeLink] Updating recorded Characteristic.On for [Fan] to [false]. No request will be sent to the device.
[12/13/2017, 9:39:06 PM] [eWeLink] Setting power state to [off] for device [Fan]
[12/13/2017, 9:39:06 PM] [eWeLink] API key retrieved from web service is [XXXXXXX]
[12/13/2017, 9:39:06 PM] [eWeLink] Connecting to the WebSocket API at [wss://us-long.coolkit.cc:8080/api/ws]
[12/13/2017, 9:39:06 PM] [eWeLink] Sending login request [{"action":"userOnline","userAgent":"app","version":6,"nonce":"151321914688000","apkVesrion":"1.8","os":"ios","at":"XXXXXXX","apikey":"xxxxxxx","ts":"1513219146","model":"iPhone10,6","romVersion":"11.1.2","sequence":1513219146880}]
[12/13/2017, 9:39:06 PM] [eWeLink] WebSocket messge received:  {"error":0,"apikey":"xxxxxxx","config":{"hb":1,"hbInterval":145},"sequence":"1513219146880"}
```

*Hey Siri, turn on the fan*
```
[12/13/2017, 9:39:09 PM] [eWeLink] Setting power state to [on] for device [Fan]
[12/13/2017, 9:39:09 PM] [eWeLink] WebSocket messge received:  {"error":0,"deviceid":"XXXXXXX","apikey":"XXXXXXX","sequence":"1513219149620"}
[12/13/2017, 9:39:11 PM] [eWeLink] Setting power state to [off] for device [Fan]
[12/13/2017, 9:39:12 PM] [eWeLink] WebSocket messge received:  {"error":0,"deviceid":"XXXXXXX","apikey":"XXXXXXX","sequence":"1513219151735"}
```

The plugin will also listen for announcements via a persistent web socket. This allows you to control the device from the likes of Google Home & have Homebridge be kept up-to-date

*Hey Google, turn on the fan*
```
[12/13/2017, 9:41:50 PM] [eWeLink] Update message received for device [XXXXXXX]
[12/13/2017, 9:41:50 PM] [eWeLink] Updating recorded Characteristic.On for [Fan] to [true]. No request will be sent to the device.
[12/13/2017, 9:41:50 PM] [eWeLink] Setting power state to [on] for device [Fan]
[12/13/2017, 9:41:50 PM] [eWeLink] WebSocket messge received:  {"error":0,"deviceid":"XXXXXXX","apikey":"XXXXXXX","sequence":"1513219310003"}
```
## Credits

https://github.com/websockets/ws/wiki/Websocket-client-implementation-for-auto-reconnect

