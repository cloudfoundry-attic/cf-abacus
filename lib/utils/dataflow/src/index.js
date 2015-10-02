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
const filter = _.filter;
const pairs = _.pairs;
const without = _.without;
const zip = _.zip;

const tmap = yieldable(transform.map);

const brequest = yieldable(retry(breaker(batch(request))));

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-dataflow');

// Resolve service URIs
const uris = urienv({
  couchdb: 5984
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
const dbhandle = (dbserver, name) => dbclient(
  dbpartition(), dbclient.dburi(dburi(dbserver, name)));

// Return a doc location given a route template and params
const loc = (req, path, id) => {
  if(!path || !id)
    return undefined;

  // List parameters from the path and the corresponding components
  // of the doc key
  const kk = without(request.params(path), 't');
  const kv = dbclient.k(id).split('/');

  return req.protocol + '://' + req.headers.host +
    (req.baseUrl || '') + request.route(path, extend({
      t: dbclient.t(id)
    }, object(zip(kk, kv))));
};

// Convert a type to an id field name
const idname = (type) => type + '_id';

// Log an input doc
const logInput = function *(idoc, ikey, itime, idb) {
  if(!idb)
    return idoc;
  const iid = dbclient.tkuri(ikey(idoc), itime(idoc));
  const ilog = extend({}, idoc, {
    id: iid
  });
  yield idb.put(ilog);
  debug('Logged input doc %o', ilog);
  return ilog;
};

// Log an output doc
const logOutput = function *(itype, ilog, odoc, okey, otime, odb) {
  if(!odb)
    return odoc;
  const oid = dbclient.tkuri(okey(odoc), otime(odoc));
  const olog = extend({},
    ilog.id ? object([[idname(itype), ilog.id]]) : {},
    odoc, {
      id: oid
    });
  yield odb.put(olog);
  debug('Logged output doc %o', olog);
  return olog;
};

// Return the URI of the sink service to post usage to
const sink = function *(id, shost, spartition) {
  const sinkp = yieldable(spartition ? spartition() : dbpartition());
  const p = yield sinkp(dbclient.k(id), dbclient.t(id), 'write');
  debug('Target sink partition %o', p);

  if(/:partition/.test(shost))
    return request.route(shost, {
      partition: p[0]
    });
  if(/:port/.test(shost))
    return request.route(shost, {
      port: 9100 + p[0]
    });
  return shost;
};

// Post an output doc to the configured sink service
const postOutput = function *(olog, shost, spartition, spost) {
  if(!spost)
    return;
  const phost = yield sink(olog.id, shost, spartition);
  yieldable.functioncb(brequest.post)(phost + spost, {
    body: olog
  }, (err, res) => {
    if(err)
      edebug('Failed to post %s to sink, %o', olog.id, err);
    else
      debug('Posted %s to sink', olog.id);
  });
};

// Log an input doc and the corresponding output docs
const log = function *(
  itype, idoc, ikey, itime, idb,
  otype, odocs, okey, otime, odb,
  shost, spartition, spost) {

    // Log the input doc
  const ilog = yield logInput(idoc, ikey, itime, idb);

    // Log the output docs
  const oids = yield tmap(odocs, function *(odoc) {
    const olog = yield logOutput(itype, ilog, odoc, okey, otime, odb);

    // Post each output doc to the configured sink service
    yield postOutput(olog, shost, spartition, spost);

    return olog.id;
  });

  return {
    iid: ilog.id,
    oids: oids
  };
};

// Return a db
const db = (dbname, dbh) => !dbname ? undefined :
  yieldable(retry(breaker(batch((dbh || dbhandle)(uris.couchdb, dbname)))));

// Return an Express router that provides a REST API to a dataflow map
// transform service
const mapper = (mapfn, opt) => {
  // Configure dbs for input and output docs
  const idb = db(opt.input.dbname, opt.input.dbhandle);
  const odb = db(opt.output.dbname, opt.output.dbhandle);

  // Create an Express router
  const routes = router();

  // Map an input doc to an output doc, store both the input and output and
  // pass the output to the configured sink service
  routes.post(opt.input.post, throttle(function *(req) {
    debug('Mapping input doc %o', req.body);

    // Validate the input doc
    if(!req.body)
      return {
        statusCode: 400
      };
    if(opt.input.schema)
      opt.input.schema.validate(req.body);

    // Map the input doc to a list of output docs
    const odocs = yield mapfn(req.body);

    // Log the input doc and output docs
    const ids = yield log(
      opt.input.type, req.body, opt.input.key, opt.input.time, idb,
      opt.output.type, odocs, opt.output.key, opt.output.time, odb,
      opt.sink.host, opt.sink.partition, opt.sink.post);

    // Return the input and output doc locations
    return {
      statusCode: 201,
      header: {
        // Return the input or output doc location
        Location:
          loc(req, opt.input.get, ids.iid) ||
          loc(req, opt.output.get, ids.oids[0])
      },

      // Return the locations of all the input and output docs
      body: filter(
        [loc(req, opt.input.get, ids.iid)].concat(
          map(ids.oids, (id) => loc(req, opt.output.get, id))),
            (uri) => uri)
    };
  }));

  // Retrieve an input doc
  if(opt.input.get)
    routes.get(opt.input.get, throttle(function *(req) {
      const ks = map(filter(
        pairs(req.params), (p) => /^k/.test(p[0])), (p) => p[1]).join('/');
      const id = dbclient.tkuri(ks, req.params.t);
      debug('Retrieving input doc for id %s', id);
      const doc = dbclient.undbify(yield idb.get(id));
      return {
        body: doc
      };
    }));

  // Retrieve an output doc
  if(opt.output.get)
    routes.get(opt.output.get, throttle(function *(req) {
      const ks = map(filter(
        pairs(req.params), (p) => p[0] !== 't'), (p) => p[1]).join('/');
      const id = dbclient.tkuri(ks, req.params.t);
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

