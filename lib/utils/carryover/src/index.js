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
  const start = moment.now();

  debug('Getting carry-over usage with key %s ...', key);
  carryOverDB.get(key, (error, doc) => {
    if (error) {
      stats.carryOver.getFailure++;
      errorFn('Error getting carry-over usage', error, undefined,
        'carryOver', start);
      cb(error);
      return;
    }

    if (doc) {
      debug('Found %j', doc);
      stats.carryOver.getSuccess++;
    }
    else {
      debug('No doc with key %s found', key);
      stats.carryOver.getNotFound++;
    }

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
 *   carryover.write(usage, usageResponse, 'started', (error, response) => {
 *     ... <process error> ...
 *     ... <reuse the input param response> ...
 *   });
 */
const carryover = (statistics, errorFn) => ({
  write: (usage, response, guid, state, cb) => {
    const resourceInfo = {
      _id: buildKey(usage),
      collector_id: extractCollectorId(response.headers.location),
      event_guid: guid,
      state: state,
      timestamp: usage.start
    };

    getDocument(resourceInfo._id, statistics, errorFn, (error, doc) => {
      if (error) {
        cb(error);
        return;
      }

      const updatedDoc = extend({}, doc, resourceInfo);

      const start = moment.now();

      debug('Upserting carry-over usage %j ...', resourceInfo);
      carryOverDB.put(updatedDoc, (error) => {
        if (error) {
          statistics.carryOver.upsertFailure++;
          errorFn('Error upserting carry-over usage', error, undefined,
            'carryOver', start);
        }
        else {
          statistics.carryOver.upsertSuccess++;
          perf.report('carryOver', start);
        }

        cb(error);
      });
    });
  },
  readPage: (startId, endId, pageSize, skip, cb) => {
    const start = moment.now();
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
        perf.report('db', start);
      }
      else {
        statistics.carryOver.readFailure++;
        errorFn(util.format('Failed reading usage data from %s to %s ' +
          'with limit %d and skip %d', startId, endId, pageSize, skip),
          error, undefined, 'carryOver', start);
      }

      cb(error, dbDocs.rows);
    });
  },
  adjustTimestamp: (usageDoc, guid, cb) => {
    const key = buildKey(usageDoc);
    getDocument(key, statistics, errorFn, (error, storedDoc) => {
      if (error) {
        debug('Failed reading document with key %s', key);
        cb(error);
        return;
      }

      const adjustedDoc = extend({}, usageDoc);

      if (!storedDoc) {
        debug('No stored document found for key %s', key);
        cb(undefined, adjustedDoc);
        return;
      }

      if (storedDoc.event_guid && storedDoc.event_guid === guid) {
        debug(`Found same ${guid} GUID. No modification needed`);
        cb(undefined, adjustedDoc);
        return;
      }

      if (storedDoc.timestamp >= usageDoc.start) {
        debug('Found doc with the same or newer timestamp.' +
          ' Increasing the timestamp');
        adjustedDoc.start = storedDoc.timestamp + 1;
        adjustedDoc.end = storedDoc.timestamp + 1;
      }
      else
        debug('Found older doc. No modification needed');

      cb(undefined, adjustedDoc);
    });
  }
});

// Export our public functions
module.exports = carryover;
