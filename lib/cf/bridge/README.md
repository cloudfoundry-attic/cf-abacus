abacus-cf-bridge
===

CF app usage reporting bridge.

The bridge reports the metrics defined in [linux-container](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/plugins/provisioning/src/resources/linux-container.js) resource:
- instance_memory [GB]
- running_instances [number]
 
For every app usage event from CF the bridge POSTs time-based usage report as follows:
- for STOPPED event: reports 0 memory and 0 insances since the timestamp in the STOPPED event
- for other events: reports the actual memory and number of instances since the timestamp of the event

## UAA Client

The bridge communicates with Cloud Controller. Register cf-bridge application as CF client with:
```bosh
gem install cf-uaac
uaac target uaa.bosh-lite.com --skip-ssl-validation
uaac token client get admin -s admin-secret
uaac client add bridge --authorized_grant_types client_credentials --authorities cloud_controller.admin --secret secret
```

**Note:** *Currently the client ID and secret are hardcoded*

## Start the bridge

### Locally

To start the bridge locally against CF running on BOSH Lite set the API and UAA addresses:

```
export API=https://api.bosh-lite.com
export UAA=https://uaa.bosh-lite.com
```

You can optionally enable the debug output with:

```
export DEBUG=abacus-cf-*
```

Finally start the bridge with:

```
cd ~/workspace/cf-abacus
npm start bridge
```

To stop the bridge:

```
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
    COUCHDB: abacus-dbserver
    EUREKA: abacus-eureka-plugin
    UAA: https://uaa.bosh-lite.com:443
    API: https://api.bosh-lite.com:443
    NODE_MODULES_CACHE: false
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

