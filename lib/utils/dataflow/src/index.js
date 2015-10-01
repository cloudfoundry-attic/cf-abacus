'use strict';

// Simple and configurable map and reduce dataflow transforms

const _ = require('underscore');
const dbclient = require('abacus-dbclient');
const batch = require('abacus-batch');
const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const yieldable = require('abacus-yieldable');
const throttle = require('abacus-throttle');
const transform = require('abacus-transform');
const request = require('abacus-request');
const urienv = require('abacus-urienv');
const router = require('abacus-router');
const partition = require('abacus-partition');

const extend = _.extend;
const map = _.map;
const object = _.object;

const tmap = yieldable(transform.map);

const brequest = yieldable(retry(breaker(batch(request))));

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-dataflow');

// Resolve service URIs
const uris = urienv({
  couchdb: 5984,
  sink: 9081
});

// Return the period used to partition incoming docs into multiple
// db partitions
const period = (t) => {
  // Use one period per day in the UTC timezone
  const d = new Date(parseInt(t));
  return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 +
    d.getUTCDate();
};

// Return a function that will convert a (bucket, period, op) to a list of
// (partition, epoch) pairs. n must be a divider of 4000 without remainder,
// as the bucket function we are using produces 4000 buckets.
const forward = (n) => (b, p, o, cb) => {
  // Use n partitions, one epoch per month, assume that each partition
  // supports all operations, and a single db per partition
  return cb(undefined, [
    [Math.floor(b / (4000 / n)), Math.floor(p / 100)]
  ]);
};

// Return the configured number of db partitions to use
const dbpartitions = (n) => n ? n :
  process.env.DB_PARTITIONS ? parseInt(process.env.DB_PARTITIONS) : 1;

// Assemble bucket, period, forward and balance conversion functions into
// a custom db partitioning function
const dbpartition = (n) => partition.partitioner(
  partition.bucket, period, forward(dbpartitions(n)), partition.balance);

// Compose the URI of a db from the db server URI and the db name
const dburi = (dbserver, name) => [dbserver, name].join('/');

// Return a handle to a db
const db = (dbserver, name) => dbclient(
  dbpartition(), dbclient.dburi(dburi(dbserver, name)));

// Return a doc location given a route template and params
const loc = (req, template, parms) => req.protocol + '://' +
  req.headers.host + req.baseUrl + request.route(template, parms);

// Convert a uri to an id field name
const idname = (uri) => uri.substr(1).replace('/', '_') + '_id';

// Log an input doc and the corresponding output docs
const log = function *(
  iuri, idoc, ikey, itime, idb,
  ouri, odocs, okey, otime, odb, sink) {

    // Log the input doc
  const iid = dbclient.tkuri(ikey(idoc), itime(idoc));
  const ilog = extend({}, idoc, {
    id: iid
  });
  yield idb.put(ilog);
  debug('Logged input doc %o', ilog);

    // Log the output docs
  const oids = yield tmap(odocs, function *(odoc) {
    const oid = dbclient.tkuri(okey(odoc), otime(odoc));
    const olog = extend({}, object([[idname(iuri), iid]]), odoc, {
      id: oid
    });
    yield odb.put(olog);
    debug('Logged output doc %o', olog);

      // Post each output doc to the configured sink service
    yieldable.functioncb(brequest.post)(sink + ouri, {
      body: olog
    }, (err, res) => {
      if(err)
        edebug('Failed to post %s to sink, %o', oid, err);
            else
              debug('Posted %s to sink', oid);
    });

    return oid;
  });

  return {
    iid: iid,
    oids: oids
  };
};

// Return an Express router that provides a REST API to a dataflow map
// transform service
const mapper = (
  iuri, ischema, idbname, ikey, itime, mapfn,
  ouri, odbname, okey, otime, cdb, csink) => {

  const dbs = cdb || db;
  const sink = csink || uris.sink;

    // Configure dbs for input and output docs
  const idb = yieldable(retry(breaker(batch(dbs(uris.couchdb, idbname)))));
  const odb = yieldable(retry(breaker(batch(dbs(uris.couchdb, odbname)))));

    // Create an Express router
  const routes = router();

    // Map an input doc to an output doc, store both the input and output and
    // pass the output to the configured sink service
  routes.post(iuri, throttle(function *(req) {
    debug('Mapping input doc %o', req.body);

      // Validate the input doc
    ischema.validate(req.body);

      // Map the input doc to a list of output docs
    const odocs = yield mapfn(req.body);

      // Log the input doc and output docs
    const ids = yield log(
        iuri, req.body, ikey, itime, idb,
        ouri, odocs, okey, otime, odb, sink);

      // Return the input and output doc locations
    return {
      statusCode: 201,
      header: {
        Location: loc(req, iuri + '/:id',
          {
            id: ids.iid
          })
      },
      body: map(ids.oids, (id) => loc(req, ouri + '/:id', {
        id: id
      }))
    };
  }));

    // Retrieve an input doc
  routes.get(iuri + '/t/:t/k/:k', throttle(function *(req) {
    const id = dbclient.tkuri(req.params.k, req.params.t);
    debug('Retrieving input doc for id %s', id);
    const doc = dbclient.undbify(yield idb.get(id));
    return {
      body: doc
    };
  }));

    // Retrieve an output doc
  routes.get(ouri + '/t/:t/k/:k', throttle(function *(req) {
    const id = dbclient.tkuri(req.params.k, req.params.t);
    debug('Retrieving output doc for id %s', id);
    const doc = dbclient.undbify(yield odb.get(id));
    return {
      body: doc
    };
  }));

  return routes;
};

// Export our public functions
module.exports.db = db;
module.exports.partition = dbpartition;
module.exports.mapper = mapper;

