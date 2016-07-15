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
const lru = require('abacus-lrucache');
const oauth = require('abacus-oauth');
const vcapenv = require('abacus-vcapenv');
const cluster = require('abacus-cluster');
const dedupe = require('abacus-dedupe');
const seqid = require('abacus-seqid');
const url = require('url');

const extend = _.extend;
const map = _.map;
const object = _.object;
const filter = _.filter;
const find = _.find;
const pairs = _.pairs;
const zip = _.zip;
const last = _.last;
const reduce = _.reduce;
const memoize = _.memoize;
const omit = _.omit;
const range = _.range;
const uniq = _.uniq;
const pick = _.pick;

const tmap = yieldable(transform.map);
const treduce = yieldable(transform.reduce);

const brequest = yieldable(throttle(retry(breaker(batch(request)))));

const lock = yieldable(lockcb);

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-dataflow');
const edebug = require('abacus-debug')('e-abacus-dataflow');
const odebug = require('abacus-debug')('o-abacus-dataflow');

// Resolve service URIs
const uris = memoize(() => urienv({
  db: 5984
}));

// Return a function that will convert a (bucket, period, op) to a list of
// (partition, epoch) pairs. n must be a divider of 4000 without remainder,
// as the bucket function we are using produces 4000 buckets.
const forward = (n) => (b, p, rw, cb) => {
  // Do not forward for write operation when bucket is NaN
  if(isNaN(b) && rw === 'write')
    return cb(new Error('Cannot forward write operation when bucket is NaN'));

  // Convert the period (# of days since Jan 1, 1970) to a YYYYMM date
  const t = new Date(p * 86400000);
  const m = t.getUTCFullYear() * 100 + t.getUTCMonth() + 1;

  // Allocate 1000 buckets per partition, one epoch per month, assume that
  // each partition supports all operations, and a single replica per
  // partition (no replication)
  // If the bucket is NaN then return all possible partitions
  const pars = isNaN(b) ? map(range(0, n), (i) => [i, m])
    : [[Math.floor(b / (4000 / n)), m]];

  debug(
    'Forwarded bucket %d, period %d, operation %s to partitions %o',
    b, p, rw, pars);
  return cb(undefined, pars);
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

// Return a handle to a LRU cache
const cache = () => lru({
  max: 10000,
  maxAge: 1000 * 3600 * 72
});

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

// Report a duplicate output doc
const dupError = (oid) => {
  debug('Duplicate output doc %s', oid);
  return extend(new Error('Duplicate document update conflict'), {
    id: oid,
    status: 409,
    error: 'conflict',
    reason: 'Duplicate document update conflict',
    noretry: true,
    nobreaker: true
  });
};

// Detect duplicate output doc
const detectDup = function *(oid, ddup, odb) {
  debug('Checking for duplicate output doc %s', oid);

  const ddoc = ddup.has(oid);
  if(ddoc === undefined) {
    debug('May be a duplicate output doc %s', oid);
    if(odb) {
      const odoc = yield odb.get(oid);
      if(odoc !== undefined)
        throw dupError(oid);
    }
  }
  else if(ddoc === true)
    throw dupError(oid);
  else
    debug('Not a duplicate output doc %s', oid);
};

// Add output doc id to duplicate filter
const filterDup = (oid, ddup) => {
  ddup.add(oid);
};

// Log an input doc
const logInput = function *(idoc, idb) {
  debug('Logging input doc %s', idoc.id);
  yield idb.put(idoc);
  debug('Logged input doc %o', idoc);
};

// Cache an accumulated output doc
const cacheAccum = (itype, idoc, odoc, okey, ocache, odb) => {
  const ocid = dbclient.kturi(okey, 0);
  const ocdoc = extend({},
    odoc, idoc.id ? object([[idname(itype), idoc.id]]) : {});

  odebug('Caching accumulated output doc %s, rev %s, cache id %s',
    odoc.id, odoc.rev, ocid);
  debug('Caching accumulated output doc %s, rev %s, cache id %s',
    odoc.id, odoc.rev, ocid);
  ocache.set(ocid, ocdoc);
  debug('Cached accumulated output doc %s, %o', ocdoc.id, ocdoc);

  return ocdoc;
};

// Cache a list of accumulated output docs
const cacheAccums = (itype, idoc, odocs, okeys, ocache, odb) => {
  // Don't cache when there is error encountered.
  if(find(odocs, (odoc) => odoc.error))
    return odocs;

  const ocdocs = map(odocs, (odoc, i, l) => {
    return cacheAccum(itype, idoc, odoc, okeys[i], ocache, odb);
  });
  return ocdocs;
};

// Return the time of the first day of last month
const lastMonth = (t) => {
  const d = new Date(parseInt(t));
  const m = (d.getUTCFullYear() - 1970) * 12 + d.getUTCMonth() - 1;
  return Date.UTC(1970 + Math.floor(m / 12), m % 12, 1);
};

// Retrieve the last accumulated output for a given input doc
const lastAccum = function *(idoc, okey, otime, ocache, odb) {
  // Look for the requested output in our db cache first
  const cid = dbclient.kturi(okey, 0);
  odebug('Retrieving cached accumulated output doc %s', cid);
  debug('Retrieving cached accumulated output doc %s', cid);
  const cdoc = ocache.get(cid);
  if(cdoc) {
    odebug('Retrieved cached accumulated output doc id %s, rev %s',
      cdoc.id, cdoc.rev);
    debug('Retrieved cached accumulated output doc id %s, rev %s, %o',
      cdoc.id, cdoc.rev, cdoc);
    return dbclient.undbify(cdoc);
  }

  // Retrieve the requested output from the db using a time range query
  const t = parseInt(otime);
  const eid = dbclient.kturi(okey, lastMonth(t));
  const sid = dbclient.kturi(okey, t + 2 * 86400000);

  debug('Retrieving latest accumulated output between %s and %s', eid, sid);
  const odocs = yield odb.allDocs({
    endkey: eid,
    startkey: sid,
    descending: true,
    limit: 1,
    include_docs: true
  });
  if(!odocs || !odocs.rows.length) {
    debug('No existing accumulated output doc since %s', eid);
    return undefined;
  }
  odebug('Retrieved accumulated output doc id %s, rev %s, %o',
    odocs.rows[0].doc.id, odocs.rows[0].doc.rev);
  debug('Retrieved accumulated output doc id %s, rev %s, %o',
    odocs.rows[0].doc.id, odocs.rows[0].doc.rev, odocs.rows[0].doc);
  return dbclient.undbify(extend({}, odocs.rows[0].doc, {
    rev: odocs.rows[0].doc._rev
  }));
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
  const t = {};
  t.protocol = u.protocol;
  if(u.port) {
    // Add the partition number to the sink host port number
    t.port = parseInt(u.port) + parseInt(p[0]);
    t.hostname = u.hostname;
    debug('Mapping partition %o to port %s', p, u.port);
  }
  else {
    // Add the partition number to the sink host name
    t.host = u.host.replace(/([^.]+)(.*)/, '$1-' + p[0] + '$2');
    debug('Mapping partition %o to hostname %s', p, u.host);
  }

  // Format the target sink URI
  const surl = url.format(t);
  debug('Target sink uri %s, partition %o', surl, p);
  return surl;
};

// Report a post error
const postError = (oid, res) => {
  debug('Post error, doc %s, response %o', oid, res);
  return extend({}, {
    id: oid,
    status: res.statusCode
  }, res.body || {});
};

// Build a list of output docs
const buildOutputs = (
  itype, idoc, itime, otype, odocs, okeys, otimes, now) => {
  return map(odocs, (odoc, i, l) => {
    return extend({},
      odoc,
      idoc.id ? object([[idname(itype), idoc.id]]) : {}, {
        id: dbclient.kturi(okeys[i], otimes[i]),
        processed_id: seqid.pad16(itime),
        processed: parseInt(itime)
      });
  });
};

// Post an output doc to the configured sink service
const postOutput = function *(odoc, skey, stime,
  shost, spartition, spost, authentication) {

  // Only post docs that have a post uri configured for them
  if(!spost) {
    debug('Skipping post of output doc %s to sink', odoc.id);
    return {
      statusCode: 201
    };
  }

  const sid = dbclient.kturi(skey, stime);
  const phost = yield sink(sid, shost, spartition);

  debug('Posting output doc %s to %s', odoc.id, phost + spost);
  try {
    const res = yield brequest.post(phost + spost,
      extend(authentication ? {
        headers: {
          authorization: authentication()
        }
      } : {}, {
        body: omit(odoc, 'rev')
      }));

    // Report sink service status
    if(res.statusCode !== 201)
      throw postError(odoc.id, res);

    debug('Posted %s successfully to sink', odoc.id);

    return res;
  }
  catch(exc) {
    edebug('Exception posting %s to sink, %o', odoc.id, exc);
    debug('Exception posting %s to sink, %o', odoc.id, exc);
    throw exc;
  }
};

// Post a list of output docs to the configured sink service
const postOutputs = function *(odocs, skeys, stimes,
  shost, spartition, sposts, authentication) {

  // Find the first occurence of error in the list of docs.
  const error = find(odocs, (odoc) => odoc.error);

  // When there is an error in any of the docs, return the first
  // encountered error.
  if(error) {
    debug('Document has error %o', error);
    return {
      error: error.error,
      reason: error.reason
    };
  }

  // Post each docs to the sink.
  const responses = yield tmap(odocs, function *(odoc, i, l) {
    return yield postOutput(odoc, skeys[i], stimes[i],
      shost, spartition, sposts[i], authentication);
  });

  debug('Checking results of post to sink');

  // Compile any errors returned from the sink
  const ereasons = reduce(responses, (a, response) => {
    debug('post returns %o', response);
    return response.body && response.body.error ? a.concat(response.body) : a;
  }, []);

  // return errors if one is found from the sink
  return ereasons.length ? {
    error: 'esink',
    reason: ereasons
  } : undefined;
};

// Log an output doc
const logOutput = function *(odoc, odb) {
  odebug('Logging output doc %s, rev %s', odoc.id, odoc.rev);
  debug('Logging output doc %s, rev %s', odoc.id, odoc.rev);
  try {
    const res = yield odb.put(odoc.rev ? extend({}, omit(odoc, 'rev'), {
      _rev: odoc.rev
    }) : odoc);
    odoc.rev = res.rev;
  }
  catch(err) {
    odebug('Error logging output doc %s, rev %s, %o',
      odoc.id, odoc.rev, err);
    debug('Error logging output doc %s, rev %s, %o',
      odoc.id, odoc.rev, err);
    throw err;
  }
  odebug('Logged new output doc %s, rev %s', odoc.id, odoc.rev);
  debug('Logged output doc %s, rev %s, %o', odoc.id, odoc.rev, odoc);
};

// Log a list of output docs
const logOutputs = function *(odocs, odb) {
  const ids =
    map(odocs.concat([]).reverse(), (doc) => pick(doc, 'id', 'rev'));
  odebug('Logging output docs %o', ids);
  debug('Logging output docs %o', ids);

  // Find unique docs by id, as we only want the last version of each doc
  yield tmap(uniq(odocs.concat([]).reverse(), (doc) => doc.id),
    function *(odoc, i, l) {
      // Log each doc into the output database
      yield logOutput(odoc, odb);
    });
};

// Log an error doc
const logError = function *(edoc, edb) {
  debug('Logging error doc %s', edoc.id);
  yield edb.put(edoc);
  debug('Logged error doc %o', edoc);
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

// Return a configured db name
const dbname = (key, def) => {
  const env = process.env[key];
  if(env)
    return env === 'false' || env === '' ? undefined : env;
  return def;
};

// Return a db
const db = (dbname, dbh) => !dbname ? undefined :
  yieldable(throttle(retry(breaker(batch(
    (dbh || dbhandle)(uris().db, dbname), 20, 100, dbcsize)))));

// Return an errordb
const errordb = (dbname) => !dbname ? undefined :
  yieldable(throttle(retry(breaker(batch(
    dbclient(partition.singleton, dbclient.dburi(uris().db, dbname)))))));

// Return an Express router that provides a REST API to a dataflow map
// transform service
const mapper = (mapfn, opt) => {
  // Configure dbs for input, output and error docs
  const idb = db(dbname('INPUT_DB', opt.input.dbname), opt.input.dbhandle);
  const odb = db(dbname('OUTPUT_DB', opt.output.dbname), opt.output.dbhandle);
  const edb = errordb(dbname('ERROR_DB', opt.error && opt.error.dbname));

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
  /* eslint complexity: [1, 6] */
  const play = function *(req, idoc) {
    debug('Mapping input doc %o', idoc);

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

    // Compute the input/output/sink doc keys and times
    const ikey = opt.input.key(idoc, auth);
    const itime = opt.input.time(idoc);
    const okeys = opt.output.keys(idoc, ikey);
    const otimes = opt.output.times(idoc, itime);
    const skeys = (opt.sink.keys || opt.output.keys)(idoc, ikey);
    const stimes = (opt.sink.times || opt.output.times)(idoc, itime);

    // Generate ids for the input doc
    const pidoc = extend({}, idoc, {
      id: dbclient.tkuri(ikey, itime),
      processed_id: seqid.pad16(itime),
      processed: idoc.processed || parseInt(itime)
    }, idoc.id ? object([[idname(opt.input.type), idoc.id]]) : {});

    let error;

    // Serialize processing on leaf output doc id
    const oid = dbclient.kturi(last(okeys), last(otimes));
    const unlock = yield lock(oid);
    try {
      // Check for duplicate output doc
      if(ddup)
        yield detectDup(oid, ddup, odb);

      // Log the input doc
      if(idb)
        yield logInput(pidoc, idb);

      // Map the input doc to a list of output docs
      debug('Calling map function with input doc %o', pidoc);
      const odocs = yield ymapfn(pidoc, auth);
      debug('Map function result docs %o', odocs);

      // Build the final output docs
      const now = Date.now();
      const podocs = buildOutputs(
        opt.input.type, pidoc, itime,
        opt.output.type, odocs, okeys, otimes,
        now);
      debug('Processed input doc %s, produced output docs %o',
        pidoc.id, map(podocs, (podoc) => podoc.id));

      // Post the output docs to the configured sink
      if(opt.sink.host && opt.sink.posts)
        error = yield postOutputs(podocs, skeys, stimes,
          opt.sink.host, opt.sink.apps, opt.sink.posts,
          opt.sink.authentication);

      // Log the output docs when there is no error encountered
      if(odb && !error)
        yield logOutputs(podocs, odb);

      // Log the input doc with the error attached
      if(edb && error) {
        const ekey = opt.error.key(idoc, ikey);
        const etime = opt.error.time(idoc, itime);
        const eid = dbclient.tkuri(ekey, etime);
        const doc = yield edb.get(eid);

        // Don't post duplicate error doc
        if(!doc) {
          const edoc = extend({}, idoc, {
            id: eid
          }, error);
          yield logError(edoc, edb);
        }
      }

      // Add leaf output doc id to duplicate filter
      // Don't add duplicate filter when there is error
      if(ddup && !error)
        filterDup(oid, ddup);
    }
    catch(err) {
      debug('Map error %o', err);
      throw err;
    }
    finally {
      unlock();
    }

    // Return the input doc location
    return extend({
      statusCode: 201,
      header: {
        Location: loc(req, opt.input.get, pidoc.id)
      }
    }, error ? {
      body: error
    } : {});
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

  // Retrieve error docs
  if(opt.error && opt.error.get)
    routes.get(opt.error.get, throttle(function *(req) {
      const ts = map(filter(
        pairs(req.params), (p) => /^t/.test(p[0])), (p) => p[1]).join('/');

      debug('Retrieving error docs up to %s', ts);

      // Get all error beginning of time to t in descending order
      const docs = yield edb.allDocs({
        startkey: dbclient.tkuri('', ts + 'Z'),
        endkey: dbclient.tkuri('', 0),
        descending: true,
        include_docs: true
      });

      // Authorize using error read access
      if (opt.error.rscope)
        oauth.authorize(req.headers && req.headers.authorization,
          opt.error.rscope(docs));

      return {
        body: map(docs.rows, (row) => {
          return dbclient.undbify(row.doc);
        })
      };
    }));

  // Delete an error doc
  if(opt.error && opt.error.delete)
    routes.delete(opt.error.delete, throttle(function *(req) {
      const ks = map(filter(
        pairs(req.params), (p) => /^k/.test(p[0])), (p) => p[1]).join('/');
      const ts = map(filter(
        pairs(req.params), (p) => /^t/.test(p[0])), (p) => p[1]).join('/');

      // Get doc from edb
      const id = dbclient.tkuri(ks, ts);
      debug('Retrieving error doc with id %s', id);
      const edoc = yield edb.get(id);

      if(!edoc)
        return {
          statusCode: 404
        };

      // Authorize using error delete access
      if (opt.error.dscope)
        oauth.authorize(req.headers && req.headers.authorization,
          opt.error.dscope());

      debug('Removing error doc %o', edoc);
      const status = yield edb.remove(edoc);
      debug('Delete status %o', status);

      return {
        body: status
      };
    }));

  // Return the router
  routes.play = play;
  routes.config = () => opt;

  return routes;
};

// Group and reduce a batch of input docs sharing the same group keys
const groupReduce = (itype,
  yreducefn,
  otype, ocache, odb,
  shost, spartition, sposts) => {

  return yieldable(batch(batch.groupBy(function *(calls) {
    debug('Reducing a group of %d input docs with group key %s',
      calls.length, calls[0][0].igroups.join('/'));

    // Lock the input group
    const unlock = yield lock(calls[0][0].igroups[0]);
    try {
      // Read the last accumulated outputs produced for the given input
      const accums = yield tmap(
        zip(calls[0][0].okeys, calls[0][0].otimes), function *(kts, i, l) {
          if(!odb)
            return {};
          return yield lastAccum(
            calls[0][0].idoc, kts[0], kts[1], ocache, odb);
        });

      // Apply the reduction function to each input doc in the batch
      const idocs = map(calls, (call) => call[0].idoc);
      debug('Calling group reduction with accums %o and input docs %o',
        accums, idocs);

      const gdocs = yield yreducefn(
        accums, idocs, calls[0][0].authorization);
      debug('Output docs from group reduce function %o', gdocs);

      // Build the final output docs
      const now = Date.now();

      const pgdocs = map(gdocs, (odocs, i, l) => {
        const podocs = buildOutputs(
          itype, calls[i][0].idoc, calls[i][0].itime,
          otype, odocs, calls[i][0].okeys, calls[i][0].otimes, now);
        debug('Processed input doc %s, produced output docs %o',
            calls[i][0].idoc.id, map(podocs, (podoc) => podoc.id));
        return podocs;
      });

      // Post the output docs to the configured sink
      const presults = yield treduce(pgdocs,
        function *(presults, podocs, i, l) {
          if(!shost || !sposts)
            return presults.concat([undefined]);

          const res = yield postOutputs(podocs,
            calls[i][0].skeys, calls[i][0].stimes,
            shost, spartition, sposts, calls[i][0].authentication);
          return presults.concat([res]);
        }, []);

      // Find any errors in the post results
      const errors = filter(presults, (res) => res !== undefined);

      // Only log and cache the output docs if all posts have succeeded
      if(odb && !errors.length) {
        // Build final list of output docs to log
        const allpodocs = reduce(pgdocs, (allpodocs, podocs) => {
          return allpodocs.concat(map(podocs, (podoc, i) => {
            if(accums[i] && accums[i].id === podoc.id) {

              // Reuse the revision of the previous accumlator doc, as
              // we're updating it with the reduction result doc
              odebug('Logging reduction output as an update %s, rev %s',
                podoc.id, accums[i].rev);
              debug('Logging reduction output as an update %s, rev %s',
                podoc.id, accums[i].rev);
              podoc.rev = accums[i].rev;
              return podoc;
            }

            // Reset revision in the reduction result doc, as we're
            // storing it as a new doc
            odebug('Logging reduction output as a new doc %s', podoc.id);
            debug('Logging reduction output as a new doc %s', podoc.id);
            delete podoc.rev;
            return podoc;
          }));
        }, []);

        // Log all the output docs
        yield logOutputs(allpodocs, odb);

        // Cache all the accumulated output docs
        map(calls, (call, i, l) => {
          cacheAccums(
            itype, call[0].idoc, pgdocs[i], call[0].okeys, ocache, odb);
        });
      }

      return map(presults, (res) => [null, res]);
    }
    catch(err) {
      debug('Reduce error %o', err);
      throw err;
    }
    finally {
      unlock();
    }
  }, function *(call) {
    return call[0].igroups.join('/');
  })));
};

// Return an Express router that provides a REST API to a dataflow reduce
// transform service
const reducer = (reducefn, opt) => {
  // Configure dbs for input, output and error docs
  const idb = db(dbname('INPUT_DB', opt.input.dbname), opt.input.dbhandle);
  const odb = db(dbname('OUTPUT_DB', opt.output.dbname), opt.output.dbhandle);
  const edb = errordb(dbname('ERROR_DB', opt.error && opt.error.dbname));

  // Create a duplicate doc filter
  const ddup =
    opt.input.dedupe === false || opt.input.dedupe === 0 ?
    undefined : dedupe(opt.input.slack, opt.input.dedupe);

  // Create LRU cache for output docs
  const ocache = cache();

  // Convert the reduce function to a yieldable
  const yreducefn = yieldable(reducefn);

  // Configure our batch grouping reduction function
  const greduce = groupReduce(opt.input.type, yreducefn,
    opt.output.type, ocache, odb,
    opt.sink.host, opt.sink.apps, opt.sink.posts);

  // Create an Express router
  const routes = router();

  // Reduce an input doc to an output doc, store both the input and output
  // and pass the output to the configured sink service
  /* eslint complexity: [1, 6] */
  const play = function *(req, idoc) {
    debug('Reducing input doc %o', idoc);

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

    // Compute the input/output doc keys and times
    const ikey = opt.input.key(idoc, auth);
    const itime = opt.input.time(idoc);
    const okeys = opt.output.keys(idoc, ikey);
    const otimes = opt.output.times(idoc, itime);
    const skeys = (opt.sink.keys || opt.output.keys)(idoc, ikey);
    const stimes = (opt.sink.times || opt.output.times)(idoc, itime);

    // Generate ids for the input doc
    const pidoc = extend({}, idoc, {
      id: dbclient.tkuri(ikey, itime),
      processed_id: seqid.pad16(itime),
      processed: idoc.processed || parseInt(itime)
    }, idoc.id ? object([[idname(opt.input.type), idoc.id]]) : {});

    // Serialize processing on leaf output doc id
    const oid = dbclient.kturi(last(okeys), last(otimes));
    const unlock = yield lock(oid);

    let error;
    try {
      // Check for duplicate output doc
      if(ddup)
        yield detectDup(oid, ddup, odb);

      // Log the input doc
      if(idb)
        yield logInput(pidoc, idb);

      // Process the input doc, post output to sink and log it
      error = yield greduce({
        igroups: opt.input.groups(pidoc),
        idoc: pidoc,
        itime: itime,
        okeys: okeys,
        otimes: otimes,
        skeys: skeys,
        stimes: stimes,
        authorization: auth,
        authentication: opt.sink.authentication
      });

      // Add leaf output doc id to duplicate filter
      if(ddup && !error)
        filterDup(oid, ddup);

      // Log the input doc with the error attached
      if(edb && error) {
        const ekey = opt.error.key(idoc, auth);
        const etime = opt.error.time(idoc);
        const eid = dbclient.tkuri(ekey, etime);
        const doc = yield edb.get(eid);

        // Don't post duplicate error doc
        if(!doc) {
          const edoc = extend({}, idoc, {
            id: eid
          }, error);
          yield logError(edoc, edb);
        }
      }
    }
    finally {
      unlock();
    }

    // Return the input doc location
    return extend({
      statusCode: 201,
      header: {
        Location: loc(req, opt.input.get, pidoc.id)
      }
    }, error ? {
      body: error
    } : {});
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

  // Retrieve error docs
  if(opt.error && opt.error.get)
    routes.get(opt.error.get, throttle(function *(req) {
      const ts = map(filter(
        pairs(req.params), (p) => /^t/.test(p[0])), (p) => p[1]).join('/');

      debug('Retrieving error docs up to %s', ts);

      // Get all error beginning of time to t in descending order
      const docs = yield edb.allDocs({
        startkey: dbclient.tkuri('', ts + 'Z'),
        endkey: dbclient.tkuri('', 0),
        descending: true,
        include_docs: true
      });

      // Authorize using error read access
      if (opt.error.rscope)
        oauth.authorize(req.headers && req.headers.authorization,
          opt.error.rscope(docs));

      return {
        body: map(docs.rows, (row) => {
          return dbclient.undbify(row.doc);
        })
      };
    }));

  // Delete an error doc
  if(opt.error && opt.error.delete)
    routes.delete(opt.error.delete, throttle(function *(req) {
      const ks = map(filter(
        pairs(req.params), (p) => /^k/.test(p[0])), (p) => p[1]).join('/');
      const ts = map(filter(
        pairs(req.params), (p) => /^t/.test(p[0])), (p) => p[1]).join('/');

      // Get doc from edb
      const id = dbclient.tkuri(ks, ts);
      debug('Retrieving error doc with id %s', id);
      const edoc = yield edb.get(id);

      if(!edoc)
        return {
          statusCode: 404
        };

      // Authorize using error delete access
      if (opt.error.dscope)
        oauth.authorize(req.headers && req.headers.authorization,
          opt.error.dscope());

      debug('Removing error doc %o', edoc);
      const status = yield edb.remove(edoc);
      debug('Delete status %o', status);

      return {
        body: status
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
    (dbh || idbhandle)(uris().db, dbname))))));

// Replay the last input docs that don't have any corresponding inputs.
// This is typically used when restarting a flow after an error.
const replay = (routes, twindow, cb) => {
  // Only replay inputs in the master process of a cluster
  if(!cluster.isMaster()) {
    cb(undefined, []);
    return;
  }

  // Use the configured replay time
  const tw = parseInt(process.env.REPLAY) || twindow;
  if(!tw) {
    cb(undefined, []);
    return;
  }

  debug('Replaying last input docs from %d msec', tw);
  yieldable.functioncb(function *() {
    const opt = routes.config();

    // Configure dbs for input, output and error docs
    const idb = replaydb(
      dbname('INPUT_DB', opt.input.dbname), opt.input.dbhandle);
    const odb = replaydb(
      dbname('OUTPUT_DB', opt.output.dbname), opt.output.dbhandle);
    const edb = errordb(
      dbname('ERROR_DB', opt.error && opt.error.dbname));

    // Retrieve the last input docs from the input db using a time
    // range db query back to the configured replay time
    const t = Date.now();
    const sid = ['t', seqid.pad16(t - tw)].join('/');
    const eid = ['t', seqid.pad16(t)].join('/');

    debug('Retrieving input docs between %s and %s', sid, eid);
    const idocs = yield idb.allDocs({
      startkey: sid,
      endkey: eid,
      include_docs: true
    });
    if(!idocs || !idocs.rows.length) {
      debug('No input docs to replay since %s', eid);
      return [];
    }
    debug('Retrieved %d input docs', idocs.rows.length);

    // Replay the input docs that don't have corresponding outputs
    const rdocs = yield treduce(idocs.rows, function *(rdocs, row, i, l) {
      const idoc = row.doc;

      // Look for the ouput doc corresponding to an input doc
      debug('Checking output doc for input %s', idoc.id);
      const ikey = dbclient.k(idoc.id);
      const itime = dbclient.t(idoc.id);
      const okeys = opt.output.keys(idoc, ikey);
      const otimes = opt.output.times(idoc, itime);
      const id = dbclient.kturi(okeys[0], otimes[0]);
      const odoc = yield odb.get(id);

      // Found the output doc, no need to replay
      if(odoc) {
        debug('Found existing output doc for input %s', idoc.id);
        return rdocs;
      }

      // Check error doc
      if(edb) {
        const ekey = opt.error.key(idoc);
        const etime = opt.error.time(idoc);
        const errid = dbclient.tkuri(ekey, etime);
        const edoc = yield edb.get(errid);

        // Found the error doc, no need to replay
        if(edoc) {
          debug('Found existing error doc for input %s', idoc.id);
          return rdocs;
        }
      }

      // Replay the input doc
      debug(
        'No existing output doc for input %s , replaying %o', idoc.id, idoc);
      const rdoc = yield routes.play(undefined,
          omit(dbclient.undbify(idoc), 'id', 'processed'));

      debug('Replayed input doc %s , new output %o', idoc.id, rdoc);
      return rdocs.concat([rdoc]);

    }, []);

    return rdocs;

  })((err, rdocs) => {
    if(err)
      edebug('Error replaying input docs %o', err);
    else
      debug('Replayed input docs %o', rdocs);
    cb(err, rdocs);
  });
};

// Export our public functions
module.exports.db = db;
module.exports.partition = dbpartition;
module.exports.mapper = mapper;
module.exports.reducer = reducer;
module.exports.replay = replay;
module.exports.sink = sink;
