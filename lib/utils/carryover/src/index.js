'use strict';

const util = require('util');

const _ = require('underscore');
const extend = _.extend;
const findWhere = _.findWhere;
const memoize = _.memoize;

const batch = require('abacus-batch');
const breaker = require('abacus-breaker');
const dbclient = require('abacus-dbclient');
const moment = require('moment');
const partition = require('abacus-partition');
const perf = require('abacus-perf');
const retry = require('abacus-retry');
const throttle = require('abacus-throttle');
const urienv = require('abacus-urienv');

// Setup debug log
const debug = require('abacus-debug')('abacus-carryover');

// Resolve service URIs
const uris = memoize(() => urienv({
  api        : 80,
  collector  : 9080,
  db         : 5984
}));

// Partitioning function that can be used for range queries
const checkKeyPart = partition.partitioner(partition.bucket,
  partition.period, partition.forward, partition.balance, true);

// Carry-over DB user to transfer usage to the next month
const carryOverDB = throttle(retry(breaker(batch(
  dbclient(checkKeyPart, dbclient.dburi(uris().db, 'abacus-carry-over'))
))));

const buildKey = (usage) => dbclient.tkuri(
  util.format('%s/%s/%s/%s/%s/%s',
    usage.organization_id, usage.space_id, usage.consumer_id,
    usage.resource_id, usage.plan_id, usage.resource_instance_id),
  moment(usage.start).utc().startOf('month').valueOf());

const extractCollectorId = (location) =>
  location.replace(uris().collector + '/v1/metering/collected/usage/', '');

const stoppedAppCriteria = { measure: 'current_instance_memory', quantity: 0 };

// Carry over utility, use like this:
//
// const statistics = {
//   carryOver: {
//     getSuccess   : 0,
//     getFailure   : 0,
//     removeSuccess: 0,
//     removeFailure: 0,
//     upsertSuccess: 0,
//     upsertFailure: 0
//   }
// };
// const errorFn = (message, error, response, name, time) => { ... };
//
// const carryover = require('abacus-carryover')(statistics, errorFn);
// carryover.write(usage, response, (error, response) => {
//   ... <process error> ...
//   ... <reuse the input param response> ...
// });
const carryover = (statistics, errorFn) => ({
  write: (usage, response, cb) => {
    const t0 = Date.now();

    const key = buildKey(usage);
    const collectorId = extractCollectorId(response.headers.location);

    carryOverDB.get(key, (error, doc) => {
      if (error) {
        statistics.carryOver.getFailure++;
        errorFn('Error getting carry-over usage', error, undefined,
          'carryOver', t0);
        cb(error, response);
        return;
      }
      statistics.carryOver.getSuccess++;

      const updatedDoc = extend({ _id: key },
        doc, { collector_id: collectorId });

      if (findWhere(usage.measured_usage, stoppedAppCriteria)) {
        debug('Removing carry-over usage for %s ...', key);
        carryOverDB.remove(updatedDoc, (error) => {

          // Handle 404 by CouchDB on missing document
          const opError = error ?
            error.status != 404 ? error : undefined
            : undefined;

          if (opError) {
            statistics.carryOver.removeFailure++;
            errorFn('Error removing carry-over usage', opError, undefined,
              'carryOver', t0);
          }
          else {
            statistics.carryOver.removeSuccess++;
            perf.report('carryOver', t0);
          }

          cb(opError, response);
        });
        return;
      }

      debug('Adding carry-over usage for %s ...', key);
      carryOverDB.put(updatedDoc, (error) => {
        if (error) {
          statistics.carryOver.upsertFailure++;
          errorFn('Error upserting carry-over usage', error, undefined,
            'carryOver', t0);
        }
        else {
          statistics.carryOver.upsertSuccess++;
          perf.report('carryOver', t0);
        }

        cb(error, response);
      });
    });
  },
  readPage: (startId, endId, pageSize, skip, cb) => {
    const t0 = Date.now();
    carryOverDB.allDocs({
      include_docs: true,
      startkey: startId,
      endkey: endId,
      limit: pageSize,
      skip: skip
    }, (error, dbDocs) => {
      if (!error) {
        debug('Found %d DB documents ...', dbDocs.rows.length);
        statistics.carryOver.docsRead += dbDocs.rows.length;
        statistics.carryOver.readSuccess++;
        perf.report('db', t0);
      }
      else {
        statistics.carryOver.readFailure++;
        errorFn(util.format('Failed reading usage data from %s to %s ' +
          'with limit %d and skip %d', startId, endId, pageSize, skip),
          error, undefined, 'carryOver', t0);
      }

      cb(error, dbDocs.rows);
    });
  }
});


// Export our public functions
module.exports = carryover;
