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
const vcapenv = require('abacus-vcapenv');
const cluster = require('abacus-cluster');
const dedupe = require('abacus-dedupe');
const url = require('url');

const extend = _.extend;
const map = _.map;
const object = _.object;
const filter = _.filter;
const pairs = _.pairs;
const zip = _.zip;
const last = _.last;
const memoize = _.memoize;

const tmap = yieldable(transform.map);

const brequest = yieldable(throttle(retry(breaker(batch(request)))));

const lock = yieldable(lockcb);

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-dataflow');
const edebug = require('abacus-debug')('e-abacus-dataflow');

// Resolve service URIs
const uris = memoize(() => urienv({
  couchdb: 5984
}), () => process.env.COUCHDB || '');

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

// Assemble bucket, period, forward and balance conversion functions into
// a custom sink partitioning function
const sinkpartition = (n) => {
  const sp = n ? n :
    process.env.SINK_APPS ? parseInt(process.env.SINK_APPS) : 1;
  return sp > 1 ?
    partition.partitioner(
      partition.bucket, partition.period, forward(sp), partition.balance) :
    partition.nopartition;
};

// Return a handle to a db
const dbhandle = (dbserver, name) => dbclient(
  dbpartition(), dbclient.dburi(dbserver, name));

// Return a handle to a LRU cache db
const cache = (name) => dbclient(
  dbpartition(1), dbclient.dburi(undefined, name), (uri, opt, cb) =>
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

  const l = (req ?
    req.protocol + '://' + req.headers.host + (req.baseUrl || '') :
    'http://localhost:9080') +
    request.route(path, extend(
      object(zip(kk, kv)), object(zip(tk, tv))));
  return l;
};

// Convert a type to an id field name
const idname = (type) => type + '_id';

// Report a duplicate input doc
const dupInput = (oid) => {
  debug('Duplicate input doc %s', oid);
  throw extend(new Error('Duplicate document update conflict'), {
    id: oid,
    status: 409,
    error: 'conflict',
    reason: 'Duplicate document update conflict',
    noretry: true,
    nobreaker: true
  });
};

// Log an input doc
const logInput = function *(idoc, ikey, itime, idb, okeys, otimes, ddup, odb) {
  if(!idb)
    return idoc;

  // Detect duplicate input doc, check for duplicates on the ids of all
  // the corresponding output docs
  if(ddup && odb) {
    const oids =
      map(zip(okeys, otimes), (kt) => dbclient.kturi(kt[0], kt[1]));

    yield tmap(oids, function *(oid, i, l) {
      debug('Checking for duplicate input doc %s', oid);
      const ddoc = ddup.has(oid);
      if(ddoc === undefined) {
        debug('May be a duplicate input doc %s', oid);
        const odoc = yield odb.get(oid);
        if(odoc !== undefined)
          return dupInput(oid);
      }
      else if(ddoc === true)
        return dupInput(oid);
      else
        debug('Not a duplicate input doc %s', oid);

      ddup.add(oid);
    });
  }

  // Log the input doc
  const iid = dbclient.tkuri(ikey, itime);
  const ilog = extend({}, idoc, {
    id: iid,
    processed: parseInt(itime)
  });
  debug('Logging input doc %s', ilog.id);
  yield idb.put(ilog);
  debug('Logged input doc %o', ilog);

  return dbclient.undbify(ilog);
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
  itype, ilog, odoc, okey, ocache, ocrev, odb) {
  if(!odb)
    return odoc;

  const ocid = dbclient.kturi(okey, 0);
  const oclog = extend({},
    ilog.id ? object([[idname(itype), ilog.id]]) : {},
    odoc, {
      id: ocid,
      processed: ilog.processed,
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
  const cid = dbclient.kturi(okey, 0);
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
  const t = parseInt(otime);
  const eid = dbclient.kturi(okey, lastMonth(t));
  const sid = dbclient.kturi(okey, t + 2 * 86400000);

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
const sink = function *(id, shost, spartition) {

  // Compute the target sink partition
  const sinkp = yieldable(
    typeof spartition === 'function' ? spartition() :
    spartition !== undefined ? sinkpartition(parseInt(spartition)) :
    sinkpartition());
  const p = yield sinkp(dbclient.k(id), dbclient.t(id), 'write');
  debug('Target sink host %s, partition %o', shost, p);

  // If there's no partitioning just return the configured sink host
  if(!p)
    return shost;

  // Map the sink host the URI of the app allocated to the target partition
  const u = url.parse(shost);

  if(u.port) {
    // Add the partition number to the sink host port number
    u.port = parseInt(u.port) + parseInt(p[0]);
    debug('Mapping partition %o to port %s', u.port);
  }
  else {
    // Add the partition number to the sink host name
    u.host = u.host.replace(/([^.]+)(.*)/, '$1-' + p[0] + '$2')
    debug('Mapping partition %o to hostname %s', u.host);
  }

  // Format the target sink URI
  const surl = u.format();
  const suri = surl.substr(0, surl.length - 1);
  debug('Target sink uri %s, partition %o', suri, p);
  return suri;
};

// Post an output doc to the configured sink service
const postOutput = function *(olog, shost, spartition, spost,
  authentication) {
  if(!spost)
    return;
  const phost = yield sink(olog.id, shost, spartition);

  debug('Posting output doc %s to %s', olog.id, phost + spost);
  const res = yield brequest.post(phost + spost,
    extend(authentication ? {
      headers: {
        authorization: authentication()
      }
    } : {}, {
      body: olog
    }));
  debug('Posted %s to sink, response status %d', olog.id, res.statusCode);
};

// Log a list of output docs
const logOutputs = function *(
  itype, ilog, itime,
  otype, odocs, okeys, otimes, odb,
  ocache, ocrev,
  shost, spartition, spost,
  authentication) {

  const oids = yield tmap(odocs, function *(odoc, i, l) {
    // Compute the accumulated output doc id
    const olog = extend({},
      ilog.id ? object([[idname(itype), ilog.id]]) : {},
      odoc, {
        id: dbclient.kturi(okeys[i], otimes[i]),
        processed: ilog.processed
      });

    // Post accumulated output doc to the configured sink service
    yield postOutput(olog, shost, spartition, spost, authentication);

    // Log accumulated output doc
    yield logOutput(olog, odb);
    return olog.id;
  });

  return oids;
};

// Compute the size of a db call, this is used to control the max size
// of a batch of calls to the db, which is set to a default of 100
const dbcsize = (name, args) => {
  // Batch 100 gets
  if(name === 'dbclient.batch_get')
    return 1;
  // Batch approx 1Mb of put, 1 represents 10K of put payload
  if(name === 'dbclient.batch_put')
    return Math.max(Math.floor(JSON.stringify(args[0]).length / 10240), 1);
  // Batch 100 of any other calls
  return 1;
};

// Return a db
const db = (dbname, dbh) => !dbname ? undefined :
  yieldable(throttle(retry(breaker(batch(
    (dbh || dbhandle)(uris().couchdb, dbname), 20, 100, dbcsize)))));

// Return an Express router that provides a REST API to a dataflow map
// transform service
const mapper = (mapfn, opt) => {
  // Configure dbs for input and output docs
  const idb = db(opt.input.dbname, opt.input.dbhandle);
  const odb = db(opt.output.dbname, opt.output.dbhandle);

  // Create a duplicate doc filter
  const ddup =
    opt.input.dedupe === false || opt.input.dedupe === 0 ?
    undefined : dedupe(opt.input.slack, opt.input.dedupe);

  // Convert the map function to a yieldable
  const ymapfn = yieldable(mapfn);

  // Create an Express router
  const routes = router();

  // Map an input doc to an output doc, store both the input and output and
  // pass the output to the configured sink service
  const play = function *(req, idoc) {
    debug('Mapping input doc %o', req.body);

    // Validate the input doc
    if(!idoc)
      return {
        statusCode: 400
      };
    if(opt.input.schema)
      opt.input.schema.validate(idoc);

    // Request authorization information
    const auth = req && req.headers && req.headers.authorization;

    // Authorize using input write access
    if (opt.input.wscope)
      oauth.authorize(auth, opt.input.wscope(idoc));

    // Log the input doc
    const ikey = opt.input.key(idoc, auth);
    const itime = opt.input.time(idoc);
    const okeys = opt.output.keys(idoc, ikey);
    const otimes = opt.output.times(idoc, itime);
    const ilog = yield logInput(
      idoc, ikey, itime, idb, okeys, otimes, ddup, odb);

    // Process the input doc, post output to sink and log it
    yieldable.functioncb(function *() {

      // Map the input doc to a list of output docs
      debug('Calling map function with input doc %o', ilog);
      const odocs = yield ymapfn(ilog, auth);
      debug('Map function result docs %o', odocs);

      // Log the output docs
      const oids = yield logOutputs(
        opt.input.type, ilog, itime,
        opt.output.type, odocs, okeys, otimes, odb,
        undefined, undefined,
        opt.sink.host, opt.sink.apps, opt.sink.post,
        opt.sink.authentication);

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
  };

  // Handle an input doc post, map it to an output doc, store both the
  // input and output and pass the output to the configured sink service
  routes.post(opt.input.post, throttle(function *(req) {

    // Process the input doc
    return yield play(req, req.body);
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

  // Return the router
  routes.play = play;
  routes.config = () => opt;

  return routes;
};

// Group and reduce a batch of input docs sharing the same group key
const groupReduce = (
  itype,
  yreducefn,
  otype, ocache, odb,
  shost, spartition, spost) => {

  return yieldable(batch(batch.groupBy(function *(calls) {
    debug(
      'Reducing a group of %d input docs with group key %s',
      calls.length, calls[0][0].igroup);

    // Lock the input group
    const unlock = yield lock(calls[0][0].igroup);
    try {

      // Read the last accumulated output produced for the given input
      const accum = yield lastAccum(calls[0][0].ilog,
        calls[0][0].okeys[0], calls[0][0].otimes[0], ocache, odb);

      // Apply the reduction function to each input doc in the batch
      const idocs = map(calls, (call) => call[0].ilog);
      debug(
        'Calling group reduce function with accum %o and input docs %o',
        accum.doc, idocs);

      const gdocs = yield yreducefn(
        accum.doc, idocs, calls[0][0].authorization);
      debug('Output docs from group reduce function %o', gdocs);

      // Log the output docs and build the array of results for
      // the group
      const gres = yield tmap(gdocs, function *(odocs, i, l) {
        const oids = yield logOutputs(
          itype, calls[i][0].ilog, calls[i][0].itime,
          otype, odocs, calls[i][0].okeys, calls[i][0].otimes, odb,
          ocache, accum.crev,
          shost, spartition, spost,
          calls[i][0].authentication);

        return [undefined, oids];
      });

      // Cache the last accumulated output
      yield cacheAccum(
        itype, last(calls)[0].ilog, last(gdocs)[0],
        last(calls)[0].okeys[0], ocache, accum.crev, odb);

      debug('Reduction results %o', gres);
      return gres;
    }
    finally {
      unlock();
    }

  }, function *(call) {
    return call[0].igroup;
  })));
};

// Return an Express router that provides a REST API to a dataflow reduce
// transform service
const reducer = (reducefn, opt) => {
  // Configure dbs for input and output docs
  const idb = db(opt.input.dbname, opt.input.dbhandle);
  const odb = db(opt.output.dbname, opt.output.dbhandle);

  // Create a duplicate doc filter
  const ddup =
    opt.input.dedupe === false || opt.input.dedupe === 0 ?
    undefined : dedupe(opt.input.slack, opt.input.dedupe);

  // Configure LRU cache db for output docs
  const ocache = yieldable(cache(opt.output.dbname));

  // Convert the reduce function to a yieldable
  const yreducefn = yieldable(reducefn);

  // Configure our batch grouping reduction function
  const greduce = groupReduce(
    opt.input.type,
    yreducefn,
    opt.output.type, ocache, odb,
    opt.sink.host, opt.sink.apps, opt.sink.post);

  // Create an Express router
  const routes = router();

  // Reduce an input doc to an output doc, store both the input and output
  // and pass the output to the configured sink service
  const play = function *(req, idoc) {
    debug('Reducing input doc %o', req.body);

    // Validate the input doc
    if(!idoc)
      return {
        statusCode: 400
      };
    if(opt.input.schema)
      opt.input.schema.validate(idoc);

    // Request authorization information
    const auth = req && req.headers && req.headers.authorization;

    // Authorize using input write access
    if (opt.input.wscope)
      oauth.authorize(auth, opt.input.wscope(idoc));

    // Log the input doc
    const ikey = opt.input.key(idoc, auth);
    const itime = opt.input.time(idoc);
    const okeys = opt.output.keys(idoc, ikey);
    const otimes = opt.output.times(idoc, itime);
    const ilog = yield logInput(
      idoc, ikey, itime, idb, okeys, otimes, ddup, odb);

    // Process the input doc, post output to sink and log it
    yieldable.functioncb(function *() {

      const oids = yield greduce({
        igroup: opt.input.group(ilog),
        ilog: ilog,
        itime: itime,
        okeys: okeys,
        otimes: otimes,
        authorization: auth,
        authentication: opt.sink.authentication
      });

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
  };

  // Handle an input doc post, reduce it to an output doc, store both the
  // input and output and pass the output to the configured sink service
  routes.post(opt.input.post, throttle(function *(req) {

    // Process the input doc
    return yield play(req, req.body);
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

  // Return the router
  routes.play = play;
  routes.config = () => opt;

  return routes;
};

// Return a function that will convert a (bucket, period, op) to a list of
// (partition, epoch) pairs. This version of the forward function is used
// to target the dbs assigned to the current app
const iforward = (n) => (b, p, o, cb) => {
  // Convert the period (# of days since Jan 1, 1970) to a YYYYMM date
  const t = new Date(p * 86400000);
  const m = t.getUTCFullYear() * 100 + t.getUTCMonth() + 1;

  // Use n partitions, one epoch per month, assume that each partition
  // supports all operations, and a single db per partition
  return cb(undefined, [
    [parseInt(vcapenv.appindex()), m]
  ]);
};

// Assemble bucket, period, forward and balance conversion functions into
// the custom db partitioning function used to target the input db assigned
// to this app instance
const idbpartition = (n) => partition.partitioner(
  partition.bucket, partition.period,
  iforward(dbpartitions(n)), partition.balance);

// Return a handle to the single input db assigned to this app instance
const idbhandle = (dbserver, name) => dbclient(
  idbpartition(), dbclient.dburi(dbserver, name));

// Return a db to use when replaying docs
const replaydb = (dbname, dbh) => !dbname ? undefined :
  yieldable(throttle(retry(breaker(batch(
    (dbh || idbhandle)(uris().couchdb, dbname))))));

// Replay the last input docs that don't have any corresponding inputs.
// This is typically used when restarting a flow after an error.
const replay = (routes, twindow, cb) => {
  // Only replay inputs in the master process of a cluster
  if(!cluster.isMaster())
    return cb(undefined, []);

  // Use the configured replay time
  const tw = process.env.REPLAY ? parseInt(process.env.REPLAY) : twindow;
  if(!tw)
    return cb(undefined, []);

  debug('Replaying last input docs from %d msec', tw);
  yieldable.functioncb(function *() {
    const opt = routes.config();

    // Configure dbs for input and output docs
    const idb = replaydb(opt.input.dbname, opt.input.dbhandle);
    const odb = replaydb(opt.output.dbname, opt.output.dbhandle);

    // Retrieve the last input docs from the input db using a time
    // range db query back to the configured replay time
    const t = Date.now();
    const sid = dbclient.tkuri('', t - tw);
    const eid = dbclient.tkuri('', t);

    debug('Retrieving input docs between %s and %s', sid, eid);
    const ilogs = yield idb.allDocs({
      startkey: sid,
      endkey: eid,
      include_docs: true
    });
    if(!ilogs || !ilogs.rows.length) {
      debug('No input docs to replay since %s', eid);
      return [];
    }
    debug('Retrieved %d input docs', ilogs.rows.length);

    // Replay the input docs that don't have corresponding outputs
    const rlogs = yield treduce(ilogs, function *(rlogs, ilog, i, l) {

      // Look for the ouput doc corresponding to an input doc
      debug('Checking output doc for input %s', ilog.id);
      const id = dbclient.kturi(okey(ilog), dbclient.time(ilog.id));
      const olog = yield odb.get(id);

      // Found the output doc, no need to replay
      if(olog) {
        debug('Found existing output doc for input %s', ilog.id);
        return rlogs;
      }

      // Replay the input doc
      debug(
        'No existing output doc for input %s , replaying %o', ilog.id, ilog);

      const rlog = yield routes.play(undefined, ilog);

      debug('Replayed input doc %s , new output %o', ilog.id, rlog);
      return rlogs.concat([rlog]);

    }, []);

    return rlogs;

  })(cb);
};

// Export our public functions
module.exports.db = db;
module.exports.partition = dbpartition;
module.exports.mapper = mapper;
module.exports.reducer = reducer;
module.exports.replay = replay;

