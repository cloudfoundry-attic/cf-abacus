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
const lockcb = require('abacus-lock');
const lrudown = require('abacus-lrudown');
const oauth = require('abacus-cfoauth');

const extend = _.extend;
const map = _.map;
const object = _.object;
const filter = _.filter;
const pairs = _.pairs;
const zip = _.zip;
const last = _.last;

const tmap = yieldable(transform.map);

const brequest = yieldable(retry(breaker(batch(request))));

const lock = yieldable(lockcb);

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-dataflow');
const edebug = require('abacus-debug')('e-abacus-dataflow');

// Resolve service URIs
const uris = urienv({
  couchdb: 5984
});

// Return a function that will convert a (bucket, period, op) to a list of
// (partition, epoch) pairs. n must be a divider of 4000 without remainder,
// as the bucket function we are using produces 4000 buckets.
const forward = (n) => (b, p, o, cb) => {
  // Convert the period (# of days since Jan 1, 1970) to a YYYYMM date
  const t = new Date(p * 86400000);
  const m = t.getUTCFullYear() * 100 + t.getUTCMonth() + 1;

  // Use n partitions, one epoch per month, assume that each partition
  // supports all operations, and a single db per partition
  return cb(undefined, [
    [Math.floor(b / (4000 / n)), m]
  ]);
};

// Return the configured number of db partitions to use
const dbpartitions = (n) => n ? n :
  process.env.DB_PARTITIONS ? parseInt(process.env.DB_PARTITIONS) : 1;

// Assemble bucket, period, forward and balance conversion functions into
// a custom db partitioning function
const dbpartition = (n) => partition.partitioner(
  partition.bucket, partition.period,
  forward(dbpartitions(n)), partition.balance);

// Compose the URI of a db from the db server URI and the db name
const dburi = (dbserver, name) => [dbserver, name].join('/');

// Return a handle to a db
const dbhandle = (dbserver, name) => dbclient(
  dbpartition(), dbclient.dburi(dburi(dbserver, name)));

// Return a handle to a LRU cache db
const cache = (name) => dbclient(
  dbpartition(1), dbclient.dburi(name), (uri, opt, cb) =>
    dbclient.dbcons(uri, extend({}, opt, {
      db: lrudown
    }), cb));

// Return a doc location given a route template and params
const loc = (req, path, id) => {
  if(!path || !id)
    return undefined;

  // List parameters from the path and the corresponding components
  // of the doc key
  const kk = filter(request.params(path), (n) => /^k/.test(n));
  const kv = dbclient.k(id).split('/');
  const tk = filter(request.params(path), (n) => /^t/.test(n));
  const tv = dbclient.t(id).split('/');

  const l = req.protocol + '://' + req.headers.host +
    (req.baseUrl || '') +
    request.route(path, extend(
      object(zip(kk, kv)), object(zip(tk, tv))));
  return l;
};

// Convert a type to an id field name
const idname = (type) => type + '_id';

// Log an input doc
const logInput = function *(idoc, ikey, itime, utime, idb) {
  if(!idb)
    return idoc;
  const iid = dbclient.tkuri(ikey(idoc), itime(idoc));
  const ilog = extend({}, idoc, {
    id: iid
  });

  // No duplicate detection, just write the input doc
  if(!utime) {
    debug('Logging input doc %s', ilog.id);
    yield idb.put(ilog);
    debug('Logged input doc %o', ilog);
    return ilog;
  }

  // Duplicate detection, write the input doc twice, once with its normal
  // processing time, and once with a time that is expected to be unique
  const uid = dbclient.tkuri(ikey(idoc), utime(idoc));
  const ulog = extend({}, idoc, {
    id: uid
  });
  debug('Logging input doc %s', ilog.id);
  yield idb.put(ilog);
  debug('Logged input doc %o', ilog);

  debug('Logging unique input doc %s', ulog.id);
  yield idb.put(ulog);
  debug('Logged unique input doc %o', ulog);
  return ilog;
};

// Log an output doc
const logOutput = function *(olog, odb) {
  if(!odb)
    return odoc;
  debug('Logging output doc %s', olog.id);
  yield odb.put(olog);
  debug('Logged output doc %o', olog);
  return olog;
};

// Cache an accumulated output doc
const cacheAccum = function *(
  itype, ilog, odoc, okey, otime, ocache, ocrev, odb) {
  if(!odb)
    return odoc;

  const ocid = dbclient.kturi(okey(ilog), 0);
  const oclog = extend({},
    ilog.id ? object([[idname(itype), ilog.id]]) : {},
    odoc, {
      id: ocid,
      _rev: ocrev
    });
  debug('Caching accumulated output doc %s', ocid);
  yield ocache.put(oclog);
  debug('Cached accumulated output doc %o', oclog);

  return oclog;
};

// Return the time of the first day of last month
const lastMonth = (t) => {
  const d = new Date(parseInt(t));
  const m = (d.getUTCFullYear() - 1970) * 12 + d.getUTCMonth() - 1;
  return Date.UTC(1970 + Math.floor(m / 12), m % 12, 1);
};

// Retrieve the last accumulated output for a given input doc
const lastAccum = function *(ilog, okey, otime, ocache, odb) {
  if(!odb)
    return {};

  // Look for the requested output in our db cache first
  const cid = dbclient.kturi(okey(ilog), 0);
  debug('Retrieving cached accumulated output doc %s', cid);
  const cdoc = yield ocache.get(cid);
  if(cdoc) {
    debug('Retrieved cached accumulated output doc %o', cdoc);
    return {
      doc: dbclient.undbify(cdoc),
      crev: cdoc._rev
    };
  }

  // Retrieve the requested output from the db using a time range query
  const t = otime(ilog);
  const eid = dbclient.kturi(okey(ilog), lastMonth(t));
  const sid = dbclient.kturi(okey(ilog), t + 2 * 86400000);

  debug('Retrieving latest accumulated output between %s and %s', eid, sid);
  const ologs = yield odb.allDocs({
    endkey: eid,
    startkey: sid,
    descending: true,
    limit: 1,
    include_docs: true
  });
  if(!ologs || !ologs.rows.length) {
    debug('No existing accumulated output doc since %s', eid);
    return {};
  }
  debug('Retrieved accumulated output doc %o', ologs.rows[0].doc);
  return {
    doc: dbclient.undbify(ologs.rows[0].doc)
  };
};

// Return the URI of the sink service to post usage to
const sink = function *(id, shost, sport, spartition) {
  const sinkp = yieldable(spartition ? spartition() : dbpartition());
  const p = yield sinkp(dbclient.k(id), dbclient.t(id), 'write');
  debug('Target sink partition %o', p);

  if(/:partition/.test(shost))
    return request.route(shost, {
      partition: p[0]
    });
  if(/:port/.test(shost))
    return request.route(shost, {
      port: sport + p[0]
    });
  return shost;
};

// Post an output doc to the configured sink service
const postOutput = function *(olog, shost, sport, spartition, spost, auth) {
  if(!spost)
    return;
  const phost = yield sink(olog.id, shost, sport, spartition);

  debug('Posting output doc %s to %s', olog.id, phost + spost);
  const res = yield brequest.post(phost + spost,
    extend(auth ? {
      headers: {
        authorization: auth
      }
    } : {}, {
      body: olog
    }));
  debug('Posted %s to sink, response status %d', olog.id, res.statusCode);
};

// Log a list of output docs
const logOutputs = function *(
  itype, ilog,
  otype, odocs, okey, otime, odb,
  ocache, ocrev,
  shost, sport, spartition, spost,
  auth) {

  const oids = yield tmap(odocs, function *(odoc, i, l) {
    // Compute the accumulated output doc id
    const olog = extend({},
      ilog.id ? object([[idname(itype), ilog.id]]) : {},
      odoc, {
        id: i === 0 && ocache ?
          dbclient.kturi(okey(ilog), otime(ilog)) :
          dbclient.kturi(okey(odoc), otime(odoc))
      });

    // Post accumulated output doc to the configured sink service
    yield postOutput(olog, shost, sport, spartition, spost, auth);

    // Log accumulated output doc
    yield logOutput(olog, odb);
    return olog.id;
  });

  return oids;
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

  // Convert the map function to a yieldable
  const ymapfn = yieldable(mapfn);

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

    // Authorize and forward authorization header field to mapfn and log
    const auth = req.headers && req.headers.authorization;

    // Authorize using input write access
    if (opt.input.wscope)
      oauth.authorize(auth, opt.input.wscope(req.body));

    // Log the input doc
    const ilog = yield logInput(
      req.body, opt.input.key, opt.input.time, opt.input.utime, idb);

    // Process the input doc, post output to sink and log it
    yieldable.functioncb(function *() {

      // Map the input doc to a list of output docs
      debug('Calling map function with input doc %o', req.body);
      const odocs = yield ymapfn(req.body, auth);
      debug('Map function result docs %o', odocs);

      // Log the output docs
      const oids = yield logOutputs(
        opt.input.type, ilog,
        opt.output.type, odocs, opt.output.key, opt.output.time, odb,
        undefined, undefined,
        opt.sink.host, opt.sink.port, opt.sink.partition, opt.sink.post,
        auth);
      return oids;

    })((err, res) => {
      if(err)
        edebug('Error processing input doc %s, %o', ilog.id, err);
      else
        debug('Processed input doc %s, produced outputs %o', ilog.id, res);
    });

    // Return the input doc location
    return {
      statusCode: 201,
      header: {
        Location: loc(req, opt.input.get, ilog.id)
      }
    };
  }));

  // Retrieve an input doc
  if(opt.input.get)
    routes.get(opt.input.get, throttle(function *(req) {
      const ks = map(filter(
        pairs(req.params), (p) => /^k/.test(p[0])), (p) => p[1]).join('/');
      const ts = map(filter(
        pairs(req.params), (p) => /^t/.test(p[0])), (p) => p[1]).join('/');
      const id = dbclient.tkuri(ks, ts);
      debug('Retrieving input doc for id %s', id);
      const doc = yield idb.get(id);
      if(!doc)
        return {
          statusCode: 404
        };

      // Authorize using input read access
      if (opt.input.rscope)
        oauth.authorize(req.headers && req.headers.authorization,
          opt.input.rscope(doc));

      return {
        body: dbclient.undbify(doc)
      };
    }));

  // Retrieve an output doc
  if(opt.output.get)
    routes.get(opt.output.get, throttle(function *(req) {
      const ks = map(filter(
        pairs(req.params), (p) => /^k/.test(p[0])), (p) => p[1]).join('/');
      const ts = map(filter(
        pairs(req.params), (p) => /^t/.test(p[0])), (p) => p[1]).join('/');
      const id = dbclient.kturi(ks, ts);
      debug('Retrieving output doc for id %s', id);
      const doc = yield odb.get(id);
      if(!doc)
        return {
          statusCode: 404
        };

      // Authorize using output read access
      if (opt.output.rscope)
        oauth.authorize(req.headers && req.headers.authorization,
          opt.output.rscope(doc));

      return {
        body: dbclient.undbify(doc)
      };
    }));

  return routes;
};

// Group and reduce a batch of input docs sharing the same group key
const groupReduce = (
  itype,
  yreducefn,
  otype, ogroup, okey, otime,
  ocache,
  odb,
  shost, sport, spartition, spost) => {

  return yieldable(batch(batch.groupBy(function *(calls) {
    debug(
      'Reducing a group of %d input docs with group key %s',
      calls.length, calls[0][0].g);

    // Lock the input group
    const unlock = yield lock(calls[0][0].g);
    try {

      // Read the last accumulated output produced for the given input
      const accum = yield lastAccum(
        calls[0][0].idoc, okey, otime, ocache, odb);

      // Apply the reduction function to each input doc in the batch
      const idocs = map(calls, (call) => call[0].idoc);
      debug(
        'Calling group reduce function with accum %o and input docs %o',
        accum.doc, idocs);

      const gdocs = yield yreducefn(accum.doc, idocs, calls[0][0].auth);
      debug('Output docs from group reduce function %o', gdocs);

      // Log the output docs and build the array of results for
      // the group
      const gres = yield tmap(gdocs, function *(odocs, i, l) {
        const oids = yield logOutputs(
          itype, calls[i][0].ilog,
          otype, odocs, okey, otime, odb,
          ocache, accum.crev,
          shost, sport, spartition, spost,
          calls[i][0].auth);

        return [undefined, oids];
      });

      // Cache the last accumulated output
      yield cacheAccum(
        itype, last(calls)[0].ilog, last(gdocs)[0],
        okey, otime, ocache, accum.crev, odb);

      debug('Reduction results %o', gres);
      return gres;
    }
    finally {
      unlock();
    }

  }, function *(call) {
    return call[0].g;
  })));
};

// Return an Express router that provides a REST API to a dataflow reduce
// transform service
const reducer = (reducefn, opt) => {
  // Configure dbs for input and output docs
  const idb = db(opt.input.dbname, opt.input.dbhandle);
  const odb = db(opt.output.dbname, opt.output.dbhandle);

  // Configure LRU cache db for output docs
  const ocache = yieldable(cache(opt.output.dbname));

  // Convert the reduce function to a yieldable
  const yreducefn = yieldable(reducefn);

  // Configure our batch grouping reduction function
  const greduce = groupReduce(
    opt.input.type,
    yreducefn,
    opt.output.type, opt.output.group, opt.output.key, opt.output.time,
    ocache,
    odb,
    opt.sink.host, opt.sink.port, opt.sink.partition, opt.sink.post);

  // Create an Express router
  const routes = router();

  // Map an input doc to an output doc, store both the input and output and
  // pass the output to the configured sink service
  routes.post(opt.input.post, throttle(function *(req) {
    debug('Reducing input doc %o', req.body);

    // Validate the input doc
    if(!req.body)
      return {
        statusCode: 400
      };
    if(opt.input.schema)
      opt.input.schema.validate(req.body);

    // Authorize and forward authorization header field to reducefn and log
    const auth = req.headers && req.headers.authorization;

    // Authorize using input write access
    if (opt.input.wscope)
      oauth.authorize(auth, opt.input.wscope(req.body));

    // Log the input doc
    const ilog = yield logInput(
      req.body, opt.input.key, opt.input.time, opt.input.utime, idb);

    const oids = yield greduce({
      g: (opt.output.group || opt.output.key)(req.body),
      idoc: req.body,
      ilog: ilog,
      auth: auth
    });

    // Return the input and output doc locations
    return {
      statusCode: 201,
      header: {
        // Return the input or output doc location
        Location:
          loc(req, opt.input.get, ilog.id) ||
          loc(req, opt.output.get, oids[0])
      },

      // Return the locations of all the input and output docs
      body: filter(
        [loc(req, opt.input.get, ilog.id)].concat(
          map(oids, (id) => loc(req, opt.output.get, id))),
            (uri) => uri)
    };
  }));

  // Retrieve an input doc
  if(opt.input.get)
    routes.get(opt.input.get, throttle(function *(req) {
      const ks = map(filter(
        pairs(req.params), (p) => /^k/.test(p[0])), (p) => p[1]).join('/');
      const ts = map(filter(
        pairs(req.params), (p) => /^t/.test(p[0])), (p) => p[1]).join('/');
      const id = dbclient.tkuri(ks, ts);
      debug('Retrieving input doc for id %s', id);
      const doc = yield idb.get(id);
      if(!doc)
        return {
          statusCode: 404
        };

      // Authorize using input read access
      if (opt.input.rscope)
        oauth.authorize(req.headers && req.headers.authorization,
          opt.input.rscope(doc));

      return {
        body: dbclient.undbify(doc)
      };
    }));

  // Retrieve an output doc
  if(opt.output.get)
    routes.get(opt.output.get, throttle(function *(req) {
      const ks = map(filter(
        pairs(req.params), (p) => /^k/.test(p[0])), (p) => p[1]).join('/');
      const ts = map(filter(
        pairs(req.params), (p) => /^t/.test(p[0])), (p) => p[1]).join('/');
      const id = dbclient.kturi(ks, ts);
      debug('Retrieving output doc for id %s', id);
      const doc = yield odb.get(id);
      if(!doc)
        return {
          statusCode: 404
        };

      // Authorize using output read access
      if (opt.output.rscope)
        oauth.authorize(req.headers && req.headers.authorization,
          opt.output.rscope(doc));

      return {
        body: dbclient.undbify(doc)
      };
    }));

  return routes;
};

// Export our public functions
module.exports.db = db;
module.exports.partition = dbpartition;
module.exports.mapper = mapper;
module.exports.reducer = reducer;

