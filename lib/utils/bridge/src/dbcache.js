'use strict';

const batch = require('abacus-batch');
const breaker = require('abacus-breaker');
const dbclient = require('abacus-dbclient');
const moment = require('abacus-moment');
const partition = require('abacus-partition');
const perf = require('abacus-perf');
const retry = require('abacus-retry');
const throttle = require('abacus-throttle');
const yieldable = require('abacus-yieldable');
const _ = require('underscore');
const extend = _.extend;

const debug = require('abacus-debug')('abacus-bridge-dbcache');
const edebug = require('abacus-debug')('e-abacus-bridge-dbcache');

const create = (config, statistics) => {
  const documentId = config.documentId;

  const db = yieldable(throttle(retry(breaker(batch(
    dbclient(partition.singleton, dbclient.dburi(
      config.url, 'abacus-cf-bridge'))
  )))));

  let revision;

  const read = function *() {
    debug('Reading value with id "%s"...', documentId);
    const readStart = moment.now();
    try {
      const doc = yield db.get(documentId);
      if (doc)
        revision = doc._rev;

      debug('Successfully read value with id "%s": %o', documentId, doc);
      perf.report('cache.read', readStart);
      statistics.successfulReads++;
      return doc;
    }
    catch (err) {
      edebug('Failed to read value with id "%s"!', documentId);
      statistics.failedReads++;
      throw err;
    }
  };

  const write = function *(value) {
    const newDocument = extend({}, value, { _id: documentId, _rev: revision });
    debug('Writing value with id "%s": %o...', documentId, newDocument);
    const writeStart = moment.now();
    try {
      const doc = yield db.put(newDocument);
      revision = doc.rev;
      debug('Successfully wrote value with id "%s": %o', documentId, doc);
      perf.report('cache.write', writeStart);
      statistics.successfulWrites++;
    }
    catch (err) {
      edebug('Failed to write value with id "%s": %o. Error: %o',
        documentId, newDocument, err);
      statistics.failedWrites++;
      throw err;
    }
  };

  return {
    read,
    write
  };
};

const createStatistics = () => {
  return {
    failedReads: 0,
    successfulReads: 0,
    failedWrites: 0,
    successfulWrites: 0
  };
};

module.exports = create;
module.exports.createStatistics = createStatistics;
