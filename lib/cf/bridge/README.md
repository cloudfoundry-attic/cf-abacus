abacus-cf-bridge
===

CF app usage reporting bridge.


## UAA Client

Register cf-bridge application as CF client with:

```
gem install cf-uaac
uaac-login.sh
uaac client add bridge --authorized_grant_types client_credentials --authorities cloud_controller.admin --secret secret
```

**Note:** *Currently the client ID and secret are hardcoded*

## Start the bridge

To start the bridge with CF running on bosh-lite set the API and UAA addresses:

```
export API=https://api.10.244.0.34.xip.io
export UAA=https://uaa.10.244.0.34.xip.io
```

You can enable the debug output with:

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