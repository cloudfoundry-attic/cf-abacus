'use strict';

const _ = require('underscore');
const dbclient = require('abacus-dbclient');
const batch = require('abacus-batch');
const breaker = require('abacus-breaker');
const lru = require('abacus-lrucache');
const moment = require('abacus-moment');
const partition = require('abacus-partition');
const retry = require('abacus-retry');
const request = require('abacus-request');
const router = require('abacus-router');
const throttle = require('abacus-throttle');
const transform = require('abacus-transform');
const urienv = require('abacus-urienv');
const yieldable = require('abacus-yieldable');

const memoize = _.memoize;

// Setup the debug
const debug = require('abacus-debug')('abacus-notify');

// Resolve service URIs
const uris = memoize(
  () =>
    urienv({
      db_uri: 5984
    }),
  () => process.env.DB || ''
);

// Return a function that will convert a (bucket, period, op) to a list of
// (partition, epoch) pairs. n must be a divider of 4000 without remainder,
// as the bucket function we are using produces 4000 buckets.
const forward = (n) => (b, p, o, cb) => {
  const m = moment.toYYYYMM(p);

  // Use n partitions, one epoch per month, assume that each partition
  // supports all operations, and a single db per partition
  return cb(undefined, [[Math.floor(b / (4000 / n)), m]]);
};

// Return the configured number of db partitions to use
const dbpartitions = (n) => (n ? n : process.env.DB_PARTITIONS ? parseInt(process.env.DB_PARTITIONS) : 1);

// Assemble bucket, period, forward and balance conversion functions into
// a custom db partitioning function
const dbpartition = (n) =>
  partition.partitioner(partition.bucket, partition.period, forward(dbpartitions(n)), partition.balance);

// Return a handle to a LRU cache
const cache = () =>
  lru({
    max: 10000,
    maxAge: 1000 * 3600 * 72
  });

// Returns a dbhandle
const dbhandle = (dbserver, name) => dbclient(dbpartition(), dbclient.dburi(dbserver, name));

// Compute the size of a db call, this is used to control the max size
// of a batch of calls to the db, which is set to a default of 100
const dbcsize = (name, args) => {
  // Batch 100 gets
  if (name === 'dbclient.batch_get') return 1;
  // Batch approx 1Mb of put, 1 represents 10K of put payload
  if (name === 'dbclient.batch_put') return Math.max(Math.floor(JSON.stringify(args[0]).length / 10240), 1);
  // Batch 100 of any other calls
  return 1;
};

// Return a db
const db = (dbname, dbh) =>
  !dbname
    ? undefined
    : yieldable(throttle(retry(breaker(batch((dbh || dbhandle)(uris().db_uri, dbname), 20, 100, dbcsize)))));

// Takes a list of urls and does a POST request on everyone one asynchronously
const notify = (l, cb) => {
  debug('Notifying %o', l);
  transform.map(
    l,
    function*(uri, i, uris, ucb) {
      // Calls a post on the given URL
      request.post(uri, {}, function(err, res) {
        if (err) return 0;
        return 1;
      });
    },
    cb
  );
};

// Creates a notifier and creates express routes for accepting events
const registrar = (opt) => {
  const rdb = db(opt.dbname, opt.dbhandle);
  const rcache = cache();
  const routes = router();

  // Setup the registration creation endpoint
  routes.post(opt.post, function*(req) {
    yield rdb.put(req.body);
    rcache.set(req.body.id, req.body);
    return {
      statusCode: 201
    };
  });

  return routes;
};

module.exports.notify = notify;
module.exports.registrar = registrar;
