node-dns-sd
===============

The node-dns-sd is a Node.js module which is a pure javascript implementation of mDNS/DNS-SD (Apple Bonjour) browser and packet parser. It allows you to discover IPv4 addresses in the local network specifying a service name such as `_http._tcp.local`. Besides, it allows you to monitor mDNS/DNS-SD packets.

This module focuses on discovering IPv4 addresses from a service name. It is not a full implementation of mDNS/DNS-SD. If you want to announce services or send custom query packets or discover IPv6 addresses, you should choice another one from [mDNS/DNS-SD nodejs implementations](https://www.npmjs.com/search?q=mDNS&page=1&ranking=optimal).

## Dependencies

* [Node.js](https://nodejs.org/en/) 4 +
  * Though the node-dns-sd works on Node 4 for now, it is strongly recommended to use Node 6 or newer. The node-dns-sd will not support Node 4 in the future.

## Installation

```
$ cd ~
$ npm install node-dns-sd
```

---------------------------------------
## Table of Contents

* [Quick Start](#Quick-Start)
  * [Discover devices](#Quick-Start-1)
  * [Monitor packets](#Quick-Start-2)
* [`DnsSd` object](#DnsSd-object)
  * [discover() method](#DnsSd-discover-method)
  * [startMonitoring() method](#DnsSd-startMonitoring-method)
  * [stopMonitoring() method](#DnsSd-stopMonitoring-method)
  * [`ondata` event handler](#DnsSd-ondata-event-handler)
* [`DnsSdPacket` object](#DnsSdPacket-object)
* [Release Note](#Release-Note)
* [References](#References)
* [License](#License)

---------------------------------------
## <a id="Quick-Start">Quick Start</a>

### <a id="Quick-Start-1">Discover devices</a>

The node-dns-sd supports a Promise-based method for discovering devices in the local network. The sample code below shows how to discover devices from a service name. In the sample code, `_googlecast._tcp.local` is specified for a service name.

```JavaScript
const mDnsSd = require('node-dns-sd');

mDnsSd.discover({
  name: '_googlecast._tcp.local'
}).then((device_list) =>{
  console.log(JSON.stringify(device_list, null, '  '));
}).catch((error) => {
  console.error(error);
});
```

The sample code above will output the result as follows:

```
[
  {
    "address": "192.168.11.20",
    "fqdn": "BRAVIA-4K-GB-0000043926ff4f7fed3bf248db400000._googlecast._tcp.local",
    "modelName": "BRAVIA 4K GB",
    "familyName": "KJ-43X8300D",
    "service": {
      "port": 8009,
      "protocol": "tcp",
      "type": "googlecast"
    },
    "packet": {...}
  },
  {
    "address": "192.168.11.12",
    "fqdn": "Google-Home-000001eda257d1f8ea765acd79500000._googlecast._tcp.local",
    "modelName": "Google Home",
    "familyName": "Google Home in living room",
    "service": {
      "port": 8009,
      "protocol": "tcp",
      "type": "googlecast"
    },
    "packet": {...}
  }
]
```

As you can see, you can obtain information of devices which support the service specified to the [`discover()`](#DnsSd-discover-method) method.

The value of the `packet` property in the response is a [`DnsSdPacket`](#DnsSdPacket-object) object which represents a DNS-SD response packet. You can find more information in the object.

### <a id="Quick-Start-2">Monitor packets</a>

The node-dns-sd has a mDNS/DNS-SD packet parser. It can watch mDNS/DNS-SD packets in the local network and reports the packets as human-readable information.

```JavaScript
const mDnsSd = require('node-dns-sd');

mDnsSd.ondata = (packet) => {
  console.log(JSON.stringify(packet, null, '  '));
};

mDnsSd.startMonitoring().then(() => {
  console.log('Started.');
}).catch((error) => {
  console.error(error);
});
```

The sample code above will output the result as follows:

```
...
{
  "header": {
    "id": 0,
    "qr": 0,
    "op": 0,
    "aa": 0,
    "tc": 0,
    "rd": 0,
    "ra": 0,
    "z": 0,
    "ad": 0,
    "cd": 0,
    "rc": 0,
    "questions": 3,
    "answers": 2,
    "authorities": 0,
    "additionals": 1
  },
  "questions": [
    {
      "name": "_homekit._tcp.local",
      "type": "PTR",
      "class": "IN"
    },
    {
      "name": "A6A1A463-D197-53EA-892B-FFFFFFFFFFFF._homekit._tcp.local",
      "type": "TXT",
      "class": "IN"
    },
    {
      "name": "_sleep-proxy._udp.local",
      "type": "PTR",
      "class": "IN"
    }
  ],
  "answers": [
    {
      "name": "_homekit._tcp.local",
      "type": "PTR",
      "class": "IN",
      "flash": false,
      "ttl": 4500,
      "rdata": "A6A1A463-D197-53EA-892B-FFFFFFFFFFFF._homekit._tcp.local"
    },
    {
      "name": "_sleep-proxy._udp.local",
      "type": "PTR",
      "class": "IN",
      "flash": false,
      "ttl": 4500,
      "rdata": "70-00-00-00.1 Apple TV._sleep-proxy._udp.local"
    }
  ],
  "authorities": [],
  "additionals": [
    {
      "name": "",
      "type": "OPT",
      "class": "",
      "flash": false,
      "ttl": 4500,
      "rdata": "00 04 00 0e 00 24 c2 a5 3e 4c 7c b6 c0 a5 3e 4c 7c b4"
    }
  ],
  "address": "192.168.11.24"
}
...
```

The object above is a [`DnsSdPacket`](#DnsSdPacket-object) object which represents a mDNS/DNS-SD response packet.


---------------------------------------
## <a id="DnsSd-object">`DnsSd` object</a>

In order to use the node-dns-sd, you have to load the node-dns-sd module as follows:

```JavaScript
const DnsSd = require('node-dns-sd');
```

In the code snippet above, the variable `DnsSd` is a `DnsSd` object. The `DnsSd` object has methods as described in sections below.

### <a id="DnsSd-discover-method">discover() method</a>

The `discover()` method discovers devices supporting the service specified to this method in the local network. This method returns a `Promise` object.

This method takes a hash object containing the properties as follows:

Property | Type    | Required | Description
:--------|:--------|:---------|:-------------------------
`name`   | String  | Required | Service name.(e.g., `"_googlecast._tcp.local"`)
`type`   | String  | Optional | Query Type (e.g., `"PTR"`). The default value is `"*"`.
`key`    | String  | Optional | This value must be `"address"` (default) or `"fqdn"`. This property indicates how to fold multiple DNS-SD query responses. See the description below for details.
`wait`   | Integer | Optional | Duration of monitoring (sec). The default value is 3 sec.
`quick`  | Boolean | Optional | If `true`, this method returns immediately after a device was found ignoring the value of the `wait`. The default value is `false`.
`filter` | String  | Optional | If a string is specified to the `filter`, this method discovers only devices which the specified string is found in the `fqdn`, `address`, `modelName` or `familyName`.
`filter` | Function | Optional | If a function is specified to the `filter`, this method discovers only devices for which the function returns `true`. See the sample code below for details.

If you want to discover all services in the local netowrk, you can set the `name` property to `_services._dns-sd._udp.local'`.

```javascript
mDnsSd.discover({
  name: '_services._dns-sd._udp.local',
  type: 'PTR',
  key: 'fqdn'
}).then((device_list) =>{
  console.log(JSON.stringify(device_list, null, '  '));
}).catch((error) => {
  console.error(error);
});
```

The `type` property indicates the query type, such as `"PTR"`. This value must be a (Q)TYPE value defined in the [RFC 1035](https://tools.ietf.org/html/rfc1035) and [RFC 2782](https://tools.ietf.org/html/rfc2782). If this property is not specified, the wildcard `"*"` will be applied.

The `key` property indicates how to fold multiple DNS-SD query responses. If the value is set to `"address"` or this property is not specified, the last response form an IP address will be reported. If you want to discover IP addresses rather than services, this mode is appropriate.

If the value of the `key` property is set to `"fqdn"`, responses will be folded by each FQDN. In this mode, multiple responses with the same IP address could be included. If you want to discover services rather than IP address, this mode is appropriate.

Basically you don't need to pass the `wait` property to this method. In most cases, the default value `3` (sec) works well.

The code blow would find Google devices (Google Home, Google TV, etc.):

```JavaScript
mDnsSd.discover({
  name: '_googlecast._tcp.local'
}).then((device_list) =>{
  console.log(JSON.stringify(device_list, null, '  '));
}).catch((error) => {
  console.error(error);
});
```

The code above will output the result as follows:

```
[
  {
    "address": "192.168.11.20",
    "fqdn": "BRAVIA-4K-GB-0000043926ff4f7fed3bf248db400000._googlecast._tcp.local",
    "modelName": "BRAVIA 4K GB",
    "familyName": "KJ-43X8300D",
    "service": {
      "port": 8009,
      "protocol": "tcp",
      "type": "googlecast"
    },
    "packet": {...}
  },
  {
    "address": "192.168.11.12",
    "fqdn": "Google-Home-000001eda257d1f8ea765acd79500000._googlecast._tcp.local",
    "modelName": "Google Home",
    "familyName": "Google Home in living room",
    "service": {
      "port": 8009,
      "protocol": "tcp",
      "type": "googlecast"
    },
    "packet": {...}
  }
]
```

A string is set to the `filter` parameter, this method limits to devices whose `fqdn`, `address`, `modelName` or `familyName` includes the string.

```javascript
mDnsSd.discover({
  name: '_googlecast._tcp.local',
  filter: 'Google Home',
  quick: true
}).then((device_list) =>{
  console.log(JSON.stringify(device_list, null, '  '));
}).catch((error) => {
  console.error(error);
});
```

A function is set to the `filter` parameter, this method limits to devices for which the function returns `true`. The function must return `true` or `false`.

```javascript
mDnsSd.discover({
  name: '_googlecast._tcp.local',
  filter: (devcie) => {
    return (device['modelName'] === 'Google Home' && /Living room/.test(device['familyName']));
  },
  quick: true
}).then((device_list) =>{
  console.log(JSON.stringify(device_list, null, '  '));
}).catch((error) => {
  console.error(error);
});
```

As you can see from the code above, an object representing a found device is passed to the function. You can evaluate the device information and limit to devices you want.

The `discover()` method will pass a information list of the found devices to the callback function. Each device information in the list contains the properties as follows:

Property      | Type    | Description
:-------------|:--------|:---------------
`address`     | String  | IPv4 address
`fqdn`        | String  | Fully Qualified Domain Name
`modelName`   | String  | Model Name
`familyName`  | String  | Family Name
`service`     | Object  |
+`port`       | Integer | Port number (e.g., `8009`)
+`protocol`   | String  | Protocol (e.g., `"tcp"`)
+`type`       | String  | Service type (e.g., "`googlecast`")
`packet`      | [`DnsSdPacket`](#DnsSdPacket-object) | An object representing the response packet

Note that the values of properties other than the `address` are not necessarily set in this object. If the values are not obtained from the response packet, they will be set to `null`.

Here are some examples:

#### Apple TV

```JavaScript
mDnsSd.discover({
  name: '_airplay._tcp.local'
})
```
```
[
  {
    "address": "192.168.11.29",
    "fqdn": "Apple TV._airplay._tcp.local",
    "modelName": "Apple TV J42dAP",
    "familyName": null,
    "service": {
      "port": 7000,
      "protocol": "tcp",
      "type": "airplay"
    },
    "packet": {...}
  }
]
```

#### Canon Network printer

```JavaScript
mDnsSd.discover({
  name: '_printer._tcp.local'
})
```
```
[
  {
    "address": "192.168.11.99",
    "fqdn": "Canon MF720C Series._ipp._tcp.local",
    "modelName": "Canon MF720C Series",
    "familyName": null,
    "service": {
      "port": 80,
      "protocol": "tcp",
      "type": "ipp"
    },
    "packet": {...}
  }
]
```

#### Philips Hue Bridge

```JavaScript
mDnsSd.discover({
  name: '_hap._tcp.local'
})
```
```
[
  {
    "address": "192.168.11.18",
    "fqdn": "Philips hue - 123ABC._hap._tcp.local",
    "modelName": "Philips hue BSB002",
    "familyName": null,
    "service": {
      "port": 8080,
      "protocol": "tcp",
      "type": "hap"
    },
    "packet": {...}
  }
]
```

#### Raspberry Pi (Raspbian)

```JavaScript
mDnsSd.discover({
  name: 'raspberrypi.local'
})
```
```
[
  {
    "address": "192.168.11.34",
    "fqdn": null,
    "productName": null,
    "modelName": null,
    "familyName": null,
    "service": null,
    "packet": {...}
  }
]
```

### <a id="DnsSd-startMonitoring-method">startMonitoring() method</a>

The `startMonitoring()` method starts the monitoring mode and  listens to mDNS/DNS-SD packets. This method returns a `Promise` object.

You can catch incoming packets setting a callback function to the [`ondata`](#DnsSd-ondata-event-handler) event handler.

```JavaScript
mDnsSd.ondata = (packet) => {
  console.log(JSON.stringify(packet, null, '  '));
};

mDnsSd.startMonitoring().then(() => {
  console.log('Started.');
}).catch((error) => {
  console.error(error);
});
```

Whenever a mDNS/DNS-SD packet is received, a [`DnsSdPacket`](#DnsSdPacket-object) object will be passed to the callback function. See the section "[`DnsSdPacket`](#DnsSdPacket-object) object" for more details.

### <a id="DnsSd-stopMonitoring-method">stopMonitoring() method</a>

The `stopMonitoring()` method stops the monitoring mode started by the [`startMonitoring()`](#DnsSd-startMonitoring-method) method. This method returns a `Promise` object.

```JavaScript
mDnsSd.stopMonitoring().then(() => {
  console.log('Stopped.');
}).catch((error) => {
  console.error(error);
});
```

### <a id="DnsSd-ondata-event-handler">`ondata` event handler</a>

The `ondata` event handler will be called whenever a mDNS/DNS-SD packet is received. Note that this event handler works only if the monitoring mode is active.

See the section "[`startMonitoring()` method](#DnsSd-startMonitoring-method)" for more details.

---------------------------------------
## <a id="DnsSdPacket-object">`DnsSdPacket` object</a>

The `DnsSdPacket` object represents a mDNS/DNS-SD packet. It is a hash object containing the properties as follows:

```
{
  "header": {
    "id": 0,
    "qr": 1,
    "op": 0,
    "aa": 1,
    "tc": 0,
    "rd": 0,
    "ra": 0,
    "z": 0,
    "ad": 0,
    "cd": 0,
    "rc": 0,
    "questions": 0,
    "answers": 1,
    "authorities": 0,
    "additionals": 3
  },
  "questions": [],
  "answers": [
    {
      "name": "_googlecast._tcp.local",
      "type": "PTR",
      "class": "IN",
      "flash": false,
      "ttl": 120,
      "rdata": "Google-Home-0ae0c1eda257d1f8ea765acd00000000._googlecast._tcp.local"
    }
  ],
  "authorities": [],
  "additionals": [
    {
      "name": "Google-Home-0ae0c1eda257d1f8ea765acd00000000._googlecast._tcp.local",
      "type": "TXT",
      "class": "IN",
      "flash": true,
      "ttl": 4500,
      "rdata": {
        "id": "0ae0c1eda257d1f8ea765acd00000000",
        "cd": "A4030CC6FEF4C94DFCD31B0500000000",
        "rm": "2CE3F99700000000",
        "ve": "05",
        "md": "Google Home",
        "ic": "/setup/icon.png",
        "fn": "Google Home in living room",
        "ca": "2052",
        "st": "0",
        "bs": "FA8F00000000",
        "nf": "1",
        "rs": ""
      },
      "rdata_buffer": {
        "id": {Buffer object},
        "cd": {Buffer object},
        "rm": {Buffer object},
        "ve": {Buffer object},
        "md": {Buffer object},
        "ic": {Buffer object},
        "fn": {Buffer object},
        "ca": {Buffer object},
        "st": {Buffer object},
        "bs": {Buffer object},
        "nf": {Buffer object},
        "rs": {Buffer object}
      }
    },
    {
      "name": "Google-Home-0ae0c1eda257d1f8ea765acd00000000._googlecast._tcp.local",
      "type": "SRV",
      "class": "IN",
      "flash": true,
      "ttl": 120,
      "rdata": {
        "priority": 0,
        "weight": 0,
        "port": 8009,
        "target": "0ae0c1ed-a257-d1f8-ea76-000000000000.local"
      }
    },
    {
      "name": "0ae0c1ed-a257-d1f8-ea76-000000000000.local",
      "type": "A",
      "class": "IN",
      "flash": true,
      "ttl": 120,
      "rdata": "192.168.11.12"
    }
  ],
  "address": "192.168.11.12"
}
```

Note that the `rdata_buffer` property is added only if the type is `"TXT"`. Each value in the `rdata_buffer` is a `Buffer` object. Some devices set a binary data to each value. You can parse the binary data using this property.

See the section "[References](#References)" for more details.

---------------------------------------
## <a id="Release-Note">Release Note</a>

* v0.4.2 (2020-09-30)
  * Catch dropMembership error (thanks to [@bwp91](https://github.com/futomi/node-dns-sd/pull/6))
* v0.4.1 (2020-04-09)
  * Fix of address already in use on udp.addMembership method (thanks to [@SlyAndrew](https://github.com/futomi/node-dns-sd/pull/5))
* v0.4.0 (2019-02-24)
  * Added the `rdata_buffer` property in the [`DnsSdPacket`](#DnsSdPacket-object) object.
* v0.3.0 (2018-10-25)
  * Added the `key` and `type` parameters to the [`discover()`](#DnsSd-discover-method) method.
* v0.2.1 (2018-10-24)
  * Improved the device discovery. In this version, all available IPv4 network interfaces are joined to a multicast group, so that all devices in the local network are sure to be discovered.
  * Fixed a bug that some event listeners did not be removed when the discovery process is finished.
* v0.2.0 (2018-08-02)
  * Supported a function-based filtering mechanism in the [`discover()`](#DnsSd-discover-method) method. Now you can specify your custom filter as a function to the `filter` paramter of the `discover()` method. (thanks to [@dayflower](https://github.com/futomi/node-dns-sd/issues/2))
* v0.1.2 (2018-01-06)
  * Fixed a bug that an exeption was thrown if the `filter` was specified to the `discover()` method.
* v0.1.0 (2018-01-06)
  * Added the parameter `quick` and `filter` to the [`discover()`](#DnsSd-discover-method) method.
  * Fixed a bug that a UDP socket was not closed properly.
* v0.0.1 (2018-01-05)
  * First public release

---------------------------------------
## <a id="References">References</a>

* [RFC 1035 (DOMAIN NAMES - IMPLEMENTATION AND SPECIFICATION)](https://tools.ietf.org/html/rfc1035)
* [RFC 6762 (Multicast DNS)](https://tools.ietf.org/html/rfc6762)
* [RFC 6763 (DNS-Based Service Discovery)](https://tools.ietf.org/html/rfc6763)
* [RFC 2782 (A DNS RR for specifying the location of services (DNS SRV))](https://tools.ietf.org/html/rfc2782)

---------------------------------------
## <a id="License">License</a>

The MIT License (MIT)

Copyright (c) 2018-2020 Futomi Hatano

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
