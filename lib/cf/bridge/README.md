abacus-cf-bridge
===

CF app usage reporting bridge.

The bridge reports the metrics defined in [linux-container](https://github.com/cloudfoundry-incubator/cf-abacus/blob/6a575e590cdd28181c4912cc530a7b6ea07744ed/lib/plugins/provisioning/src/plans/metering/basic-linux-container.js) resource:
- instance_memory [GB]
- running_instances [number]
 
For every app usage event from CF the bridge POSTs time-based usage report as follows:
- for STOPPED event: reports 0 memory and 0 insances since the timestamp in the STOPPED event
- for other events: reports the actual memory and number of instances since the timestamp of the event

## UAA Clients

The bridge communicates with Cloud Controller. Register cf-bridge application as CF client with:
```bash
gem install cf-uaac
uaac target uaa.bosh-lite.com --skip-ssl-validation
uaac token client get admin -s admin-secret
uaac client add abacus-cf-bridge --name abacus-cf-bridge --authorized_grant_types client_credentials --authorities cloud_controller.admin --secret secret
```

If you use secured Abacus installation you will need an additional resource client:
```bash
uaac client add abacus-linux-container --name abacus-linux-container --authorized_grant_types client_credentials --authorities abacus.usage.linux-container.write,abacus.usage.linux-container.read --scope abacus.usage.linux-container.write,abacus.usage.linux-container.read --secret secret
```

**Note:** Take care to set change the client ID and secret in the examples above.

## Start the bridge

### Locally

The steps below use Abacus running locally. We also assume that the Abacus installation has the abacus-authentication-plugin as a token provider.

To start the bridge locally against CF running on BOSH Lite set the API address:
```bash
export API=https://api.bosh-lite.com
```

Set the used client ID and secret with:
```bash
export CF_CLIENT_ID=abacus-cf-bridge
export CF_CLIENT_SECRET=secret
```

In case of secured Abacus set the JWT algorithm, key and the resource provider client credentials:
```bash
export CLIENT_ID=abacus-linux-container
export CLIENT_SECRET=secret
export JWTKEY=secret
export JWTALGO=HS256
```

You can optionally enable the debug output with:
``` bash
export DEBUG=abacus-cf-*
```

Finally start the bridge with:
```bash
cd ~/workspace/cf-abacus
npm start bridge
```

To stop the bridge:
```bash
npm stop bridge
```

### Cloud Foundry

To start the bridge on CF running on BOSH Lite follow the steps below.

Setup CF:
```bash
./bin/cfsetup
```
Go to bridge directory:
```bash
cd ~/workspace/cf-abacus/lib/cf/bridge
```

Edit the `manifest.yml` to look like this:
```yml
applications:
- name: abacus-cf-bridge
  host: abacus-cf-bridge
  path: .cfpack/app.zip
  instances: 1
  memory: 512M
  disk_quota: 512M
  env:
    CONF: default
    DEBUG: e-abacus*,abacus-cf*
    COLLECTOR: abacus-usage-collector
    DB: abacus-pouchserver
    EUREKA: abacus-eureka-plugin
    API: https://api.bosh-lite.com:443
    NODE_MODULES_CACHE: false
    CF_CLIENT_ID: abacus-cf-bridge
    CF_CLIENT_SECRET: secret
```

In case you are running a secured Abacus installation, add the following entries:
```yml
    SECURED: true
    AUTH_SERVER: https://api.bosh-lite.com:443
    CLIENT_ID: abacus-linux-container
    CLIENT_SECRET: secret
    JWTKEY: |+
      -----BEGIN PUBLIC KEY-----
      ... <UAA public key in PEM format> ... 
      -----END PUBLIC KEY-----
    JWTALGO: RS256
```

To limit the number of events submitted to Abacus add:
```yml
    THROTTLE: 2
```

Add the DB client implementation you would like to use with the bridge:
```yml
    DBCLIENT: abacus-couchclient
```

Build, pack and push the bridge to Cloud Foundry:
```bash
npm install && npm run babel && npm run lint && npm test &&
npm run cfpack && npm run cfpush
```

Create a database service instance, called `db` and bind it to `abacus-cf-bridge`:
```bash
cf create-service mongodb-3.0.7-lite free db
cf bind-service abacus-cf-bridge db
```

In case you want to use external DB you can do this by adding `DB` to the deployment manifest:
```yml
    DB: mongodb://user:password@mymongohost.com:27017/databaseName?ssl=true
    DBCLIENT: abacus-mongoclient
```

Start the bridge:
```bash
cf start abacus-cf-bridge
```

Tail the logs to check the progress:
```bash
cf logs abacus-cf-bridge
```

You can change the client ID and secret used to communicate with CC like so:
```
cf set-env abacus-cf-bridge CLIENT_ID <client_id>
cf set-env abacus-cf-bridge CLIENT_SECRET <secret>
cf restart abacus-cf-bridge
```

To change the resource provider (abacus-linux-container) settings or the number of connections, set the respective environment variables using `cf set-env`.

## Configuration

Bridge internal timeouts can be configured by modifying these environment variables:
* MIN_INTERVAL_TIME
   * minimum time [milliseconds] between each call to CF [app usage events API](http://apidocs.cloudfoundry.org/231/app_usage_events/list_all_app_usage_events.html)
   * this variable also controls the time between each attempt to cache the last processd app usage GUID. The bridge tries to cache the GUID every 5 * MIN_INTERVAL_TIME milliseconds
* MAX_INTERVAL_TIME
   * maximum time [milliseconds] between app usage calls to CF
   * maximum time between Abacus reporting attempts
* GUID_MIN_AGE - determines how old an app usage events should be to be reported to Abacus. New events order is not guaranteed in CC database. That's why we store only events older than the GUID_MIN_AGE. 

Note: The timeout between CF API calls and Abacus usage retries is increased exponentially with each failed attempt.


## Statistics

The bridge exposes the `/v1/cf/bridge/` endpoint that provides performance metrics and call statistics. A snippet of the values returned:
```json
    "cache": {
      "lastRecordedGUID": "35c4ff2fa",
      "lastRecordedTimestamp": "2015-08-18T11:28:20Z",
      "lastCompensatedGUID": "acc4152dab",
      "lastCompensatedTimestamp": "2015-07-18T11:24:15Z"
    },
    "statistics": {
      "cache": {
        "read": 1,
        "write": 428
      },
      "compensation": {
        "saveCalls": 999,
        "started": 831,
        "fetchSuccess": 1,
        "fetchFailure": 1,
        "usageSuccess": 22,
        "usageFailure": 0,
        "usageSkip": 36
      },
      "usage": {
        "missingToken": 0,
        "reportFailures": 2,
        "reportSuccess": 2379,
        "loopFailures": 2,
        "loopSuccess": 2357
      },
      "paging": {
        "missingToken": 1,
        "pageReadSuccess": 1,
        "pageReadFailures": 0,
        "pageProcessSuccess": 3415,
        "pageProcessFailures": 1,
        "pageProcessEnd": 67
      }
    }
 ```

The following data is available:

Cache content:
* lastRecordedGUID: GUID of the last reported event
* lastRecordedTimestamp: Timestamp of the last reported event. For example 2015-08-18T11:28:20Z
* lastCompensatedGUID: GUID of the last compensated event
* lastCompensatedTimestamp: Timestamp of the last compensated event. For example: 2015-07-18T11:24:15Z

Operation statistics:
* cache.read/write: Number of cache operations. The cache stores the last processed app usage event GUID.
* compensation
   * saveCalls: Number of applications stored in memory
   * started: Number of processed started applications
   * fetchSuccess: Successful /v2/apps list operations (usually 1)
   * fetchFailure: Failed attempts to read /v2/apps
   * usageSuccess: Successful compensation reports to Abacus
   * usageFailure: Failed compensation usage reports to Abacus
   * usageSkip: Skipped usage reports
* usage
   * missingToken: Missing abacus resource token
   * reportFailures: Number of failed usage reports
   * reportSuccess: Successful usage reports
   * loopFailures: Number of report loop failures
   * loopSuccess: Number of successful report loop cycles
* paging
   * missingToken: Missing CF CC token
   * pageReadSuccess: Number of successful page reads
   * pageReadFailures: Failed page reads
   * pageProcessSuccess: Number of successfully processed resources
   * pageProcessFailures: Number of unsuccessfully processed resources
   * pageProcessEnd: Number of processed pages
