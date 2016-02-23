abacus-cf-bridge
===

CF app usage reporting bridge.

The bridge reports the metrics defined in [linux-container](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/plugins/provisioning/src/resources/linux-container.js) resource:
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
export JWTKEY=secret;
export JWTALGO=HS256;
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
    DEBUG: abacus-cf*
    COLLECTOR: abacus-usage-collector
    DB: abacus-pouchserver
    EUREKA: abacus-eureka-plugin
    UAA: https://uaa.bosh-lite.com:443
    API: https://api.bosh-lite.com:443
    NODE_MODULES_CACHE: false
    CF_CLIENT_ID: abacus-cf-bridge
    CF_CLIENT_SECRET: secret
```

In case you are running a secured Abacus installation, add the following entries:
```yml
    SECURED: true
    AUTH_SERVER: api
    CLIENT_ID: abacus-linux-container
    CLIENT_SECRET: secret
    JWTKEY: |+
      -----BEGIN PUBLIC KEY-----
      ... <public key in PEM format> ... 
      -----END PUBLIC KEY-----
    JWTALGO: RS256
```

To limit the number of events submitted to Abacus add:
```yml
    THROTTLE: 2
```

Build, pack and push the bridge to Cloud Foundry:
```bash
npm install && npm run babel && npm run lint && npm test
npm run cfpack
npm run cfpush
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
