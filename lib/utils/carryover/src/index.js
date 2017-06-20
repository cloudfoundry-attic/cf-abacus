'use strict';

const util = require('util');

const _ = require('underscore');
const extend = _.extend;
const memoize = _.memoize;

const batch = require('abacus-batch');
const breaker = require('abacus-breaker');
const dbclient = require('abacus-dbclient');
const moment = require('abacus-moment');
const partition = require('abacus-partition');
const perf = require('abacus-perf');
const retry = require('abacus-retry');
const throttle = require('abacus-throttle');
const urienv = require('abacus-urienv');

// Setup debug log
const debug = require('abacus-debug')('abacus-carryover');

const dbalias = process.env.DBALIAS || 'db';

// Resolve service URIs
const uris = memoize(() => urienv({
  api        : 80,
  collector  : 9080,
  [dbalias]  : 5984
}));

// Partitioning function that can be used for range queries
const checkKeyPart = partition.partitioner(partition.bucket,
  partition.period, partition.forward, partition.balance, true);

// Carry-over DB user to transfer usage to the next month
const carryOverDB = throttle(retry(breaker(batch(
  dbclient(checkKeyPart, dbclient.dburi(uris()[dbalias], 'abacus-carry-over'))
))));

const buildKey = (usage) => dbclient.tkuri(
  util.format('%s/%s/%s/%s/%s/%s',
    usage.organization_id, usage.space_id, usage.consumer_id,
    usage.resource_id, usage.plan_id, usage.resource_instance_id),
  moment.utc(usage.start).startOf('month').valueOf());

const extractCollectorId = (location) =>
  location.replace(uris().collector + '/v1/metering/collected/usage/', '');

const getDocument = (key, stats, errorFn, cb) => {
  const t0 = moment.now();

  carryOverDB.get(key, (error, doc) => {
    if (error) {
      stats.carryOver.getFailure++;
      errorFn('Error getting carry-over usage', error, undefined,
        'carryOver', t0);
      cb(error);
      return;
    }

    if (doc)
      stats.carryOver.getSuccess++;
    else
      stats.carryOver.getNotFound++;

    cb(null, doc);
  });
};

/**
 * Carry-over object with functions for writing carry-over state and reading
 * a page of carry-over documents.
 *
 * @param statistics Object in the form:
 *   const statistics = {
 *     carryOver: {
 *       getSuccess   : 0,
 *       getNotFound  : 0,
 *       getFailure   : 0,
 *       removeSuccess: 0,
 *       removeFailure: 0,
 *       upsertSuccess: 0,
 *       upsertFailure: 0,
 *       readSuccess  : 0,
 *       readFailure  : 0,
 *       docsRead     : 0
 *     }
 *   };
 * @param errorFn Error function with signature:
 *   const errorFn = (message, error, response, name, time) => { ... };
 * @return Carry-over object
 *
 * The function can be used as follows:
 *   const carryover = require('abacus-carryover')(statistics, errorFn);
 *   carryover.write(usage, response, (error, response) => {
 *     ... <process error> ...
 *     ... <reuse the input param response> ...
 *   });
 */
const carryover = (statistics, errorFn) => ({
  write: (usage, resourceInfo, response, cb) => {
    const key = buildKey(usage);
    const collectorId = extractCollectorId(response.headers.location);

    getDocument(key, statistics, errorFn, (error, doc) => {
      if (error) {
        cb(error);
        return;
      }

      const updatedDoc = extend({ _id: key },
        doc, {
          collector_id: collectorId,
          state: resourceInfo.state,
          timestamp: resourceInfo.timestamp
        });

      const t0 = moment.now();

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

        cb(error);
      });
    });
  },
  readPage: (startId, endId, pageSize, skip, cb) => {
    const t0 = moment.now();
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
  },
  getDoc: (key, cb) => getDocument(key, statistics, errorFn, cb)
});

// Export our public functions
module.exports = carryover;
module.exports.buildKey = buildKey;
