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

Follow these [configuration steps](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/doc/security.md#configuration).

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
curl http://<host><:port>/debug
```
To enable `abacus-breaker` and `abacus-retry` for example:
```
curl http://<host><:port>/debug?config=abacus-breaker,abacus-retry
```
