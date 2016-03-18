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

## Scaling Abacus

Abacus supports several profiles defined in https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/etc/apps.rc. You can use these profiles when starting, stopping or deploying Abacus to Cloud Foundry. 

For example you can push Abacus pipeline meant to handle more load by pushing it with profile `large`:
```
npm run cfpush -- large
```

The profiles inherit from the `default` profile. This allows the profiles to specify only the settings that are specific for this profile. All Abacus applications have an `.apprc` file. This file details the application settings for each profile. 

The settings overriden in the profiles most often include the number of instances, applications and db partitions for the application. For example the [Accumulator settings](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/aggregation/accumulator/.apprc) defines the following profiles:
* `default` with 1 application / 1 instance
* `small` with 2 apps / 1 instance
* `medium` with 4 apps / 1 instance
* `large` with 6 apps / 1 instance

The [Reporting settings](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/metering/collector/.apprc) define the profiles as:
* `default`: 1 application / 1 instance / 1 db partition
* `small`: 1 app / 2 instances / 2 db partitions
* `medium`: 1 app / 2 instances / 4 db partitions
* `large`: 1 apps / 6 instances / 6 db partitions

You can modify the profiles or add additional ones to comply with the needs of your own installation.
