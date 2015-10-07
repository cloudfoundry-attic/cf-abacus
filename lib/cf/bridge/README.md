abacus-cf-bridge
===

CF app usage reporting bridge.


## UAA Client

Register cf-bridge application as CF client with:

```
gem install cf-uaac
uaac target uaa.10.244.0.34.xip.io
uaac token client get admin -s admin-secret
uaac client add bridge --authorized_grant_types client_credentials --authorities cloud_controller.admin --secret secret
```

**Note:** *Currently the client ID and secret are hardcoded*

## Start the bridge

To start the bridge with CF running on bosh-lite set the API and UAA addresses:

```
export API=https://api.10.244.0.34.xip.io
export UAA=https://uaa.10.244.0.34.xip.io
```

You can optionally enable the debug output with:

```
export DEBUG=abacus-cf-*
```

Finally start the bridge with:

```
cd ~/workspace/cf-abacus
npm start etc/apps-bridge
```

To stop the bridge:

```
npm stop etc/apps-bridge
```

## Usage reporting

The bridge reports the metrics defined in [linux-container](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/stubs/provisioning/src/resources/linux-container.js) resource:
- instance_memory [GB]
- running_instances [number]
 
For every app usage event from CF the bridge POSTs time-based usage report as follows:
- for STOPPED event: reports 0 memory and 0 insances since the timestamp in the STOPPED event
- for other events: reports the actual memory and number of instances since the timestamp of the event
