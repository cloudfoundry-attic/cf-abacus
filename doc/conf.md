Abacus Configuration
===

## Default port numbers used by Abacus

These port numbers are used when running Abacus in a local dev environment.

| port |      component             |
|:-----|:---------------------------|
| 5984 | abacus-pouchserver         |
|      |                            |
| 9080 | abacus-usage-collector     |   
| 9088 | abacus-usage-reporting     |  
|      |                            |
| 9100 | abacus-usage-meter         |
| 9200 | abacus-usage-accumulator   |   
| 9300 | abacus-usage-aggregator    |   
| 9500 | abacus-cf-bridge           |
|      |                            |
| 9880 | abacus-provisioning-plugin |  
| 9881 | abacus-account-plugin      |
| 9882 | abacus-authserver-plugin   |
| 9990 | abacus-eureka-plugin       |

## Securing Abacus

To run Abacus in secure mode (HTTPS + oAuth tokens) you should modify Abacus application's manifest.yml files.

The set of properties that has to be changed contains:
* SECURED - `true` / `false` - Use `true` to enable the security checks
* AUTHSERVER - Authorization Server URL used to get access token endpoint in the format of `https://hostname:port` or just `https://hostname`.
* CLIENTID - Client identifier registered with the specified authorization server.
* CLIENTSECRET - Client secret used to authenticate the client identifier with the authorization server.
* JWTKEY - Key used to sign the JWT- JWS
* JWTALGO - Cryptographic algorithm used to sign and secure JWT-JWS

### Abacus authorization server
Use the following configuration:
```
  SECURED: true
  AUTH_SERVER: abacus-authserver-plugin
  CLIENT_ID: abacus
  CLIENT_SECRET: secret
  JWTKEY: encode
  JWTALGO: HS256
```

### CF UAA
Check your UAA configuration or CF deploy manifest on how the JSON Web Token (JWT) is signed. Check the:
* JWT algorithm 
* public key (or secret)

Abacus configuration snippet for UAA:

```
    SECURED: true
    AUTH_SERVER: https://api.<CF domain>:443
    CLIENT_ID: abacus
    CLIENT_SECRET: secret
    JWTKEY: |+
      -----BEGIN PUBLIC KEY-----
      ... <UAA public key> ...
      -----END PUBLIC KEY-----
    JWTALGO: RS256
```


## Logging

Logs are controlled via the `DEBUG` environment variable. There are 3 types of logs:
* debug logs (starting with `abacus-`)
* exception logs (`e-abacus-`)
* performance logs (`p-abacus-`)

For example to monitor the inner working of the `abacus-breaker` module you need to set `DEBUG=abacus-breaker`.

You can also configure logging for multiple modules like this `DEBUG=abacus-breaker,abacus-retry`.

The logs are DEBUG logs so they will produce a lot of entries in production. Usually you'll want to use the exception logs `DEBUG=e-*`

**Dynamic/Remote configuration**

The debug log can be configured dynamically (remotely). To get the current debug log config: 
```
curl http://<host><:port>/log
```
To enable `abacus-breaker` and `abacus-retry` for example:
```
curl http://<host><:port>/log?config=abacus-breaker,abacus-retry
```
