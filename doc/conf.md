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
|      |                            |
| 9500 | abacus-cf-applications     |
| 9501 | abacus-cf-renewer          |
| 9502 | abacus-cf-services         |
|      |                            |
| 9880 | abacus-provisioning-plugin |
| 9881 | abacus-account-plugin      |
| 9882 | abacus-authserver-plugin   |
| 9990 | abacus-eureka-plugin       |

## Securing Abacus

Follow these [configuration steps](https://github.com/cloudfoundry-incubator/cf-abacus/wiki/Security).

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

The DB is configured using these environment variables:
* `DB` - URL of the database. By default Abacus uses local PouchDB (`localhost:5984`) if this variable is missing
* `DBCLIENT` - DB client to use. The default one is the `couchclient`.
* `DB_OPTS` - DB-specific connections configuration. Accepts JSON with either [Mongo](http://mongodb.github.io/node-mongodb-native/2.2/reference/connecting/connection-settings/) or [Couch/Pouch](https://pouchdb.com/api.html#create_database) connection settings.

### Local configuration

To select the DB:
* start Couch or Mongo on your machine
* use the `bin/local*` scripts to set the proper environment
* start Abacus

```bash
. ./bin/localcouchdb
yarn run build
yarn start
yarn run demo
```

*Note:* The `local*` scripts sets `JOBS=1` to force serial execution of tests and prevent multiple tests working with the same DB.

### Cloud Foundry configuration
Modify all of the application manifests (`manifest.yml`) to include the DB environment variables:
```yml
  env:
    DB: mongodb://mydbhost.com:27017
    DBCLIENT: abacus-mongoclient
```

You can use Cloud Foundry service instance, instead of hard-coded DB URL. To do so omit the `DB` environment variable above, create a DB service instance (we'll call it `db`) and execute:
* Linux:

   ```bash
   yarn run cfstage -- large
   cf apps | tail -n +5 | awk '{print $1}' | xargs -n1 | xargs -P 5 -i cf bind-service {} db
   yarn run cfstart -- large
   ```
* OS X:

   ```bash
   yarn cfpush cfstage -- large
   cf apps | tail -n +5 | awk '{print $1}' | xargs -n1 | xargs -P 5 -n 1 -J {} cf bind-service {} db
   yarn run cfstart -- large
   ```

This will stage all Abacus applications without starting them. Then we'll bind the `db` service instance to all of them, and finally we'll start the applications so they can make use of the bound service instance.

## Extending Abacus pipeline

To extend the Abacus pipeline, configure the aggregator's application sink, using the following variables:
* `SINK` specifies the host to post to
* `AGGREGATOR_SINK_APPS` is required if you are distributing the requests based on they key. This parameter is optional.
The path to which the data will be posted is `/v1/metering/aggregated/usage`

To post the documents to `http://example.com/v1/metering/aggregated/usage` export the `SINK` variable and start Abacus:
```bash
export SINK=http://example.com
yarn run start
```

For Cloud Foundry deployment you need to add `SINK` and `AGGREGATOR_SINK_APPS` variables to the aggregator's [manifest](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/lib/aggregation/aggregator/manifest.yml).
