Abacus Configuration
===

### Default port numbers used by Abacus

These port numbers are used when running Abacus in a local dev environment.

| port |      component             |
|:-----|:---------------------------|
| 5984 | abacus-dbserver            |
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

### Secure Abacus configuration

To run Abacus in secure mode (HTTPS + oAuth tokens) you should:

* Create UAA client:

   ```
   gem install cf-uaac
   uaac target uaa.bosh-lite.com
   uaac token client get admin -s secret
   uaac client add abacus --name abacus --authorized_grant_types client_credentials --scope abacus.usage.write,abacus.usage.read --secret    secret
   ```

   Note: Change the id and secret to more secure values.

* Modify relevant manifest.yml files

   The set of properties should contain:
   * SECURED - `true` / `false` - Use `true` to enable the security checks
   * AUTHSERVER - Authorization Server URL used to get access token endpoint in the format of `https://hostname:port` or just `https://hostname`.
   * CLIENTID - Client identifier registered with the specified authorization server.
   * CLIENTSECRET - Client secret used to authenticate the client identifier with the authorization server.
   * JWTKEY - Key used to sign the JWT- JWS
   * JWTALGO - Cryptographic algorithm used to sign and secure JWT-JWS

   An example section of the manifest looks like this:
   ```
     SECURED: true
     AUTH_SERVER: https://api.bosh-lite.com:443
     CLIENT_ID: abacus
     CLIENT_SECRET: secret
     JWTKEY: encode
     JWTALGO: HS256
   ```
