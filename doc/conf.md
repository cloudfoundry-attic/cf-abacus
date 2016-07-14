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

:rotating_light: **Warning:** Enabling debug logging with high visibility (`abacus-*`) may lead to increased memory consumption and eventually to out of memory errors (OOM).

**Dynamic/Remote configuration**

The debug log can be configured dynamically (remotely). To get the current debug log config: 
```
curl http://<host><:port>/debug
```
To enable `abacus-breaker` and `abacus-retry` for example:
```
curl http://<host><:port>/debug?config=abacus-breaker,abacus-retry
```

## Database

Abacus supports [CouchDB](http://couchdb.apache.org/) and [MongoDB](https://www.mongodb.com/). You can also use the in-memory [PouchDB](https://pouchdb.com/) for development and testing.

Abacus has two database clients:
* [couchclient](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/lib/utils/couchclient) - supports CouchDB and the development/testing PouchDB 
* [mongoclient](https://github.com/cloudfoundry-incubator/cf-abacus/tree/master/lib/utils/mongoclient) - supports MongoDB

The DB is configured using these environemnt variables:
* `DB` - URL of the database. By default Abacus uses local PouchDB if this variable is missing
* `DBCLIENT` - DB client to use. The default one is the `couchclient`. 

### Local configuration

To select the DB:
* start Couch or Mongo on your machine
* use the `bin/local*` scripts to set the proper environment
* start Abacus

```bash
. ./bin/localcouchdb
npm run build
npm start
npm run demo
```

*Note:* The `local*` scripts sets `JOBS=1` to force serial execution of tests and prevent multiple tests working with the same DB.

## Cloud Foundry configuration
Modify all of the application manifests (`manifest.yml`) to include the DB environment variables:
```yml
  env:
    DB: mongodb://mydbhost.com:27017
    DBCLIENT: abacus-mongoclient
```

You can use Cloud Foundry service instance, instead of hard-coded DB URL. To do so omit the `DB` environment variable above, create a DB service instance (we'll call it `db`) and execute:
* Linux:

   ```bash
   npm cfpush cfstage -- large
   cf apps | tail -n +5 | awk '{print $1}' | xargs -n1 | xargs -P 5 -i cf bind-service {} db
   npm run cfstart -- large
   ```
* OS X:

   ```bash
   npm cfpush cfstage -- large
   cf apps | tail -n +5 | awk '{print $1}' | xargs -n1 | xargs -P 5 -n 1 -J {} cf bind-service {} db
   npm run cfstart -- large
   ```

This will stage all Abacus applications without starting them. Then we'll bind the `db` service instance to all of them, and finally we'll start the applications so they can make use of the bound service instance.

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
* `large`: 1 app / 6 instances / 6 db partitions

You can modify the profiles or add additional ones to comply with the needs of your own installation.

## Extending Abacus pipeline

To extend the Abacus pipeline, configure the aggregator's application sink, using the following variables:
* `SINK` specifies the host to post to
* `AGGREGATOR_SINK_APPS` is required if you are distributing the requests based on they key. This parameter is optional.
The path to which the data will be posted is `/v1/metering/aggregated/usage`

To post the documents to `http://example.com/v1/metering/aggregated/usage` export the `SINK` variable and start Abacus:
```bash
export SINK=http://example.com
npm run start
```

For Cloud Foundry deployment you need to add `SINK` and `AGGREGATOR_SINK_APPS` variables to the aggregator's [manifest](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/aggregation/aggregator/manifest.yml).
