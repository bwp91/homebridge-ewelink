Situation: I am trying to control a smart plug which itself is not plugged in.
`Characteristic.On` calls `internalOutletUpdate()` for it's `.on("set")` event.
When trying to turn the outlet on I receive the warning at the end of this file.


Code can be seen at:
https://github.com/bwp91/homebridge-ewelink/tree/master/lib

In a nutshell:

* /eWeLink.js line 1078 `internalOutletUpdate()`, which calls
* /eWeLink.js line 1310 `sendDeviceUpdate()`, which calls
  * /eWeLinkLAN.js line 125 `sendUpdate()`, and if this fails,
  * /eWeLinkWS.js line 208 `sendUpdate()`

```
(node:1229) UnhandledPromiseRejectionWarning: it is unreachable
    at emitUnhandledRejectionWarning (internal/process/promises.js:170:15)
    at processPromiseRejections (internal/process/promises.js:247:11)
    at processTicksAndRejections (internal/process/task_queues.js:94:32)
(node:1229) UnhandledPromiseRejectionWarning: Unhandled promise rejection. This error originated either by throwing inside of an async function without a catch block, or by rejecting a promise which was not handled with .catch(). To terminate the node process on unhandled promise rejection, use the CLI flag `--unhandled-rejections=strict` (see https://nodejs.org/api/cli.html#cli_unhandled_rejections_mode). (rejection id: 3)
(node:1229) [DEP0018] DeprecationWarning: Unhandled promise rejections are deprecated. In the future, promise rejections that are not handled will terminate the Node.js process with a non-zero exit code.
    at emitDeprecationWarning (internal/process/promises.js:180:11)
    at processPromiseRejections (internal/process/promises.js:249:13)
    at processTicksAndRejections (internal/process/task_queues.js:94:32)
```
