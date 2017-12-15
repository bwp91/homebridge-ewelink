# homebridge-ewelink
Homebridge plugin to control Sonoff relays with OEM firmware. It uses the same API as the iOS app to communicate with your devices.

It has been tested with the [Sonoff basic](http://sonoff.itead.cc/en/products/sonoff/sonoff-basic) relays. I have performed testing with up to two relays associated to my account.

The plugin will only support one eWeLink account.

It is possible to continute to use the OEM functionality (eWeLink app, Google Home integration); this plugin requires no modification to the relay's firmware.

## Shortcomings

The plugin uses the same credentials as the eWeLink app. In order to obtain the authenticationToken, you'll need to use Charles to inspect the traffic and grab the value from the Authorization header. See below for information on how to obtain this value.

Also, the code is of suboptimal quality. It was a quick-and-dirty plugin; feel free to contribute & improve.

## Sample config.json

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
        "authenticationToken" : "obtain-with-Charles",
        "apiHost" : "us-api.coolkit.cc:8080",
        "webSocketApi" : "us-long.coolkit.cc"
        }
    ]
}
```

## Obtaining the Authentication Token and API URL using Charles

[Charles](https://www.charlesproxy.com/) allows us to watch the data being exchanged between the eWeLink iOS app (Android is untested) and the server endpoint.

1) Download and install the eWeLink app to your device
2) Ensure your Sonoff devices are registered and working with the native app
3) Ensure the app is logged in to your account
4) Return back to your device's home screen

With Charles configured and listening for connections from your iOS device, open up the eWeLink app from the home screen. As part of the loading of the app, you'll see requests to the following URLs (or similar, depening on your region):

```
https://us-api.coolkit.cc:8080/api/user/device?apiKey=XXXX&appVersion=X.X.X&getTags=1&imei=XXXX&lang=en&model=XXXX&os=ios&romVersion=X.X.X&version=X

https://us-ota.coolkit.cc:8080/otaother/app
```

In both of these requests, look at the request header

![Viewing HTTPS Authorization Header in Charles](https://i.imgur.com/88PlK6Eh.png)

```
Bearer abcdefghijklnmopqrstuvwxyz
```

The abcdefghijklnmopqrstuvwxyz is what you'd put as the configuration file's authenticationToken value.

API URLs are also shown in this request. You need to use the URL in webSocketApi and apiHost

### A note on the authenticationToken

The authentication token is generated every time your device's app logs in to the eWeLink service. Based on my limited testing, the session seems to persist for quite some time.

You can only have one authentication token per user account. 

If you logout and login to the app again, you'll need to perform the above steps to get things working again.

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
[12/13/2017, 9:39:06 PM] [eWeLink] Sending login request [{"action":"userOnline","userAgent":"app","version":6,"nonce":"151321914688000","apkVesrion":"1.8","os":"ios","at":"22f46c29fc9416ebced5e6ac615fc343302460ff","apikey":"xxxxxxx","ts":"1513219146","model":"iPhone10,6","romVersion":"11.1.2","sequence":1513219146880}]
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
