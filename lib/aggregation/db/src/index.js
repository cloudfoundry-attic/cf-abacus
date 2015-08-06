'use strict';

// Naming and partitioning scheme for the usage aggregation DBs.

const dbclient = require('abacus-dbclient');
const partition = require('abacus-partition');
const lrudown = require('abacus-lrudown');

// Return the period used to partition incoming usage data into multiple
// db partitions
const period = (t) => {
  // Use one period per day in the UTC timezone
  const d = new Date(parseInt(t));
  return d.getUTCFullYear() * 10000 +
    (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
};

// Return a function that will convert a (bucket, period, op) to a list of
// (partition, epoch) pairs. n must be a divider of 4000 without remainder,
// as the bucket function we are using produces 4000 buckets.
const forward = (n) => (b, p, o, cb) => {
  // Allocate 1000 buckets per partition, one epoch per month, assume that
  // each partition supports all operations, and a single db per partition
  return cb(undefined, [
    [Math.floor(b / (4000 / n)), Math.floor(p / 100)]
  ]);
};

// Assemble the bucket, period, forward and balance conversion functions into
// a custom db partitioning function
const dbpartition = (n) => partition.partitioner(
  partition.bucket, period, forward(n), partition.balance);

// Compose the URI of a metering db from the db server URI and the db name
const dburi = (dbserver, name) => [dbserver, name].join('/');

// Return a handle to a metering db
const db = (dbserver, name) => dbclient(
  dbpartition(4), dbclient.dburi(dburi(dbserver, name)));

// Return a handle to a LRU cache
const cache = (name) => dbclient(
  dbpartition(1), dbclient.dburi(name), (uri, cb) => dbclient.dbcons(uri, {
      db: lrudown
    }, cb));

// Export our public functions
module.exports = db;
module.exports.partition = dbpartition;
module.exports.cache = cache;

