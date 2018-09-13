'use strict';

const util = require('util');

const _ = require('underscore');
const extend = _.extend;
const memoize = _.memoize;

const batch = require('abacus-batch');
const breaker = require('abacus-breaker');
const dbClient = require('abacus-dbclient');
const dbCommons = require('abacus-dbcommons')();
const moment = require('abacus-moment');
const partition = require('abacus-partition');
const perf = require('abacus-perf');
const retry = require('abacus-retry');
const throttle = require('abacus-throttle');
const urienv = require('abacus-urienv');

// Setup debug log
const debug = require('abacus-debug')('abacus-carryover');
const edebug = require('abacus-debug')('e-abacus-carryover');


// Resolve service URIs
const uris = memoize(() =>
  urienv({
    api: 80,
    collector: 9080,
    db_uri: 5984
  })
);

// Partitioning function that can be used for range queries
const checkKeyPart = partition.partitioner(
  partition.bucket,
  partition.period,
  partition.forward,
  partition.balance,
  true
);

const buildKey = (usage) =>
  dbClient.tkuri(
    util.format(
      '%s/%s/%s/%s/%s/%s',
      usage.organization_id,
      usage.space_id,
      usage.consumer_id,
      usage.resource_id,
      usage.plan_id,
      usage.resource_instance_id
    ),
    moment
      .utc(usage.start)
      .startOf('month')
      .valueOf()
  );

const extractCollectorId = (location) => location.replace(uris().collector + '/v1/metering/collected/usage/', '');

const createResourceInfo = (usage, location, guid, state) => ({
  _id: buildKey(usage),
  collector_id: extractCollectorId(location),
  event_guid: guid,
  state: state,
  timestamp: usage.start
});

/**
 * Carry-over object with functions for writing carry-over state and reading
 * a page of carry-over documents.
 *
 * @param statistics Object in the form:
 *   const statistics = {
 *     carryOver: {
 *       getSuccess    : 0,
 *       getNotFound   : 0,
 *       getFailure    : 0,
 *       removeSuccess : 0,
 *       removeFailure : 0,
 *       upsertSuccess : 0,
 *       upsertFailure : 0,
 *       processSuccess: 0,
 *       processFailure: 0,
 *       pagesRead     : 0
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
const carryover = (statistics, errorFn) => {

  const carryOverDB = throttle(
    retry(breaker(batch(dbClient(checkKeyPart, dbClient.dburi(uris().db_uri, 'abacus-carry-over')))))
  );

  const write = (doc, carryOverStatistics, errorFn, cb) => {
    const start = moment.now();

    debug('Writing carry-over usage %j ...', doc);
    carryOverDB.put(doc, (error) => {
      if (error) {
        carryOverStatistics.writeFailure++;
        errorFn('Error writing carry-over usage', error, undefined, 'carryOver', start);
      } else {
        carryOverStatistics.writeSuccess++;
        perf.report('carryOver', start);
      }

      cb(error);
    });
  };

  const getDocument = (key, stats, errorFn, cb) => {
    const start = moment.now();

    debug('Getting carry-over usage with key %s ...', key);
    carryOverDB.get(key, (error, doc) => {
      if (error) {
        stats.carryOver.getFailure++;
        errorFn('Error getting carry-over usage', error, undefined, 'carryOver', start);
        cb(error);
        return;
      }

      if (doc) {
        debug('Found %j', doc);
        stats.carryOver.getSuccess++;
      } else {
        debug('No doc with key %s found', key);
        stats.carryOver.getNotFound++;
      }

      cb(null, doc);
    });
  };

  return {
    upsert: (usage, response, guid, state, cb) => {
      const resourceInfo = createResourceInfo(usage, response.headers.location, guid, state);

      getDocument(resourceInfo._id, statistics, errorFn, (error, doc) => {
        if (error) {
          cb(error);
          return;
        }

        const updatedDoc = extend({}, doc, resourceInfo);

        write(updatedDoc, statistics.carryOver, errorFn, cb);
      });
    },
    insert: (usage, response, guid, state, cb) => {
      const resourceInfo = createResourceInfo(usage, response.headers.location, guid, state);
      getDocument(resourceInfo._id, statistics, errorFn, (error, doc) => {
        if (error) {
          cb(error);
          return;
        }
        if (doc) {
          const conflictError = new Error('Document already exists.');
          conflictError.existingDocument = true;
          cb(conflictError);
          return;
        }

        write(resourceInfo, statistics.carryOver, errorFn, cb);
      });
    },
    readAllPages: (opts, processingFn, cb) => {
      const start = moment.now();

      const pageProcessingFunction = (dbDocs, pageCb) => {
        statistics.carryOver.pagesRead++;

        debug('Processing %d DB documents ...', dbDocs.length);
        processingFn(dbDocs, (error) => {
          if (error) {
            edebug('Failed processing documents %j', dbDocs);
            statistics.carryOver.processFailure += dbDocs.length;
          } else {
            statistics.carryOver.processSuccess += dbDocs.length;
            perf.report('carryOver', start);
          }

          pageCb(error);
        });
      };

      debug('Reading all pages for opts %o', opts);
      dbCommons.readAllPages(carryOverDB, opts, pageProcessingFunction, (err) => {
        if (err)
          errorFn(
            util.format(
              'Failed reading usage data from %s to %s with page size %d',
              opts.startId,
              opts.endId,
              opts.pageSize
            ),
            err,
            undefined,
            'carryOver',
            start
          );
        cb(err);
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
          debug('Found doc with the same or newer timestamp.' + ' Increasing the timestamp');
          adjustedDoc.start = storedDoc.timestamp + 1;
          adjustedDoc.end = storedDoc.timestamp + 1;
        } else debug('Found older doc. No modification needed');

        cb(undefined, adjustedDoc);
      });
    }
  };
};

// Export our public functions
module.exports = carryover;
