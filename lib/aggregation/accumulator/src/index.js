'use strict';

// Usage accumulator service.

const _ = require('underscore');
const webapp = require('abacus-webapp');
const cluster = require('abacus-cluster');
const router = require('abacus-router');
const dbclient = require('abacus-dbclient');
const batch = require('abacus-batch');
const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const yieldable = require('abacus-yieldable');
const throttle = require('abacus-throttle');
const request = require('abacus-request');
const urienv = require('abacus-urienv');
const seqid = require('abacus-seqid');
const lockcb = require('abacus-lock');
const db = require('abacus-aggregation-db');
const config = require('abacus-resource-config');

const map = _.map;
const last = _.last;
const clone = _.clone;
const extend = _.extend;
const omit = _.omit;
const filter = _.filter;

const brequest = yieldable(retry(breaker(batch(request))));

const lock = yieldable(lockcb);

/* eslint camelcase: 1 */

// The scaling factor of each time window for creating the date string
// [Second, Minute, Hour, Day, Month, Year, Forever]
const timescale = [1, 100, 10000, 1000000, 100000000, 10000000000, 0];

// Converts a millisecond number to a format a number that is YYYYMMDDHHmmSS
const dateUTCNumbify = (t) => {
  const d = new Date(t);
  return d.getUTCFullYear() * timescale[5] + d.getUTCMonth() * timescale[4]
    + d.getUTCDate() * timescale[3] + d.getUTCHours() * timescale[2]
    + d.getUTCMinutes() * timescale[1] + d.getUTCSeconds();
};

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-accumulator');

// Resolve service URIs
const uris = urienv({ couchdb: 5984, aggregator: 9200 });

// Configure accumulated usage dbs
const accumdb = yieldable(retry(breaker(batch(
    db.statedb(uris.couchdb, 'abacus-accumulated-usage')))));
const logdb = yieldable(retry(breaker(batch(
  db.logdb(uris.couchdb, 'abacus-accumulated-usage-log')))));

// Configure db caches
const accumcache = yieldable(db.cache('abacus-accumulated-usage'));

// Return a doc location given a route template and params
const loc = (req, template, parms) =>
  req.protocol + '://' + req.headers.host + request.route(template, parms);

// Return the aggregator partition to post usage to
const aggreguri = function *(k, t) {
  const aggregp = yieldable(db.partition());
  const p = yield aggregp(k, t, 'write');
  debug('Target aggregator partition %o', p);
  return /:partition/.test(uris.aggregator) ?
   request.route(uris.aggregator, { partition: p[0] }) :
   /:port/.test(uris.aggregator) ?
   request.route(uris.aggregator, { port: 9200 + p[0] }) : uris.aggregator;
};

// Return the accumulate function for a given metric
const accumfn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].accumulatefn;
};

// Return the accumulated usage for a given metric
const accum = (au, metric) => {
  const a = filter(au, (a) => a.metric === metric);
  return a.length ? a[0].quantity : [0, 0, 0, 0, 0, 0, 0];
};

// Accumulate usage and return new accumulated value
const accumulate = (a, u) => {
  // If previous accumulated value is undefined, then initialize one, else
  // clone it
  const umerge = omit(u, 'id', 'metrics', 'metered_usage', 'measured_usage');
  const amerge = !a || !a.start ? extend({ accumulated_usage: [] }, umerge) :
    extend(clone(a), omit(umerge, 'start'));
  const timediff = dateUTCNumbify(u.end) - dateUTCNumbify(a.end);

  // Calculate new accumulated usage
  const metrics = config(u.resource_id).metrics;
  const newa = extend(clone(amerge), {
    accumulated_usage: map(u.metered_usage, (mu) => {
      const aq = accum(amerge.accumulated_usage, mu.metric);
      return {
        metric: mu.metric,
        quantity: map(aq, (q, i) => {
          // If there is no previous quantity, start with a new current
          if(!q)
            return {previous: undefined,
              current: accumfn(metrics, mu.metric)(0, mu.quantity)};

          // If this is not forever, see if the new usage has passed into a
          // new window from the previous usage and start with a new current
          if(timescale[i] && timediff / timescale[i] >= 1)
            return {previous: q.current,
              current: accumfn(metrics, mu.metric)(0, mu.quantity)};

          // Accumulate the new usage into the already accumulated usage
          return { previous: q.current,
            current: accumfn(metrics, mu.metric)(q.current, mu.quantity)};
        })
      };
    })
  });

  debug('New accumulated usage %o', newa);
  return newa;
};

// Return the accumulated usage for a resource instance and a given time period
const accumulatedUsage = function *(id) {
  debug('Retrieving accumulated usage for %s', id);
  const doc = (yield accumcache.get(id)) || (yield accumdb.get(id));

  if(doc)
    debug('Found accumulated usage %o in %s', doc, doc.dbrev ? 'cache' : 'db');
  else
    debug('No existing accumulated usage');

  return doc;
};

// Log new usage and return whether it's a duplicate or not
const logUsage = function *(u, alogid, ulogid) {
  const unlock = yield lock(ulogid);
  try {
    // Log the new usage
    debug('Logging new usage %s', ulogid);
    const logdoc = extend(clone(u), {
      id: ulogid,
      metered_usage_id: u.id,
      last_accumulated_usage_id: alogid
    });
    try {
      yield logdb.put(logdoc);
      debug('Logged new usage %o', logdoc);
      return undefined;
    }
    catch(e) {
      if(e.status !== 409)
        throw e;
      debug('Search for existing usage for %s', ulogid);
      const dupdoc = yield logdb.get(ulogid);
      if(dupdoc) {
        debug('Found existing usage %o', dupdoc);
        return dupdoc;
      }
      return undefined;
    }
  }
  finally {
    unlock();
  }
};

// Log accumulated usage
const logAccumulatedUsage = function *(alogdoc) {
  debug('Logging accumulated usage %s', alogdoc.id);
  yield logdb.put(alogdoc);

  debug('Logged accumulated usage %o', alogdoc);
  return alogdoc;
};

// Store accumulated usage
const storeAccumulatedUsage = function *(a, aid, alogid, ulogid) {
  debug('Storing accumulated usage %s', aid);
  const adoc = extend(clone(omit(a, 'dbrev')), {
    id: aid,
    last_accumulated_usage_id: alogid,
    processed_usage_id: ulogid
  });

  // Store in the db
  const arev = yield accumdb.put(
    extend(clone(adoc), a.dbrev ? { _rev: a.dbrev } : {}));

  // Store in the cache as well, with the rev we got from the db
  yield accumcache.put(extend(clone(adoc), { dbrev: arev.rev }));

  debug('Stored accumulated usage %o', adoc);
  return aid;
};

// Get accumulated usage, update and store it
const updateAccumulatedUsage =
  yieldable(batch(batch.groupBy(function *(calls) {
    const aid = calls[0][0].aid;
    debug('Update accumulated usage for a group of %d usage docs with id %s',
      calls.length, aid);

    // Lock based on the given resource instance and time period
    const unlock = yield lock(aid);
    try {
      // Retrieve the accumulated usage for the given resource instance
      const a = yield accumulatedUsage(aid);

      // Accumulate usage, starting with the initial one
      let newa = omit(a, 'last_accumulated_usage_id');
      const ares = map(calls, (call) => {
        newa = accumulate(newa, call[0].u, call[0].u);
        return [undefined, newa];
      });

      // Store the final accumulated usage
      const lcall = last(calls);
      yield storeAccumulatedUsage(
        newa, aid, lcall[0].alogid, lcall[0].ulogid);

      return ares;
    }
    finally {
      unlock();
    }
  }, function *(args) {
    // Group calls by accumulated usage id
    return args[0].aid;
  })));

// Accumulate the given usage
const accumulateUsage = function *(u) {
  // Compute the usage log id and accumulated usage id
  const k = [u.organization_id, u.resource_instance_id, u.plan_id].join('/');
  const ulogid = dbclient.kturi(k, [u.end, u.start, u.end].join('/'));
  const alogid = dbclient.kturi(k, [u.end, seqid()].join('/'));
  const aid = dbclient.kturi(k, 0);

  // Log the given usage
  const dup = yield logUsage(u, alogid, ulogid);
  if(dup) {
    debug('Skipping duplicate usage %o', u);
    return dup.last_accumulated_usage_id;
  }

  // Update accumulated usage
  const newa = yield updateAccumulatedUsage({
    u: u, aid: aid, alogid: alogid, ulogid: ulogid });

  // Post the new accumulated usage to the target aggregator partition
  const alogdoc = extend(clone(omit(newa, 'dbrev')), {
    id: alogid,
    processed_usage_id: ulogid
  });
  yieldable.functioncb(brequest.post)(
    (yield aggreguri(alogdoc.organization_id, alogdoc.start)) +
      '/v1/metering/accumulated/usage', {
      body: alogdoc
    }, (err, res) => {
      if(err)
        debug('Failed to post %s to aggregator service, %o', alogid, err);
    });

  // Log the new accumulated usage
  yield logAccumulatedUsage(alogdoc);

  return alogid;
};

// Create an express router
const routes = router();

// Accumulate usage for a given resource instance
routes.post('/v1/metering/metered/usage', throttle(function *(req) {
  const u = req.body;

  // Accumulate usage
  debug('Accumulating usage %o', u);
  const id = yield accumulateUsage(u);

  // Return the location of the new accumulated usage
  return {
    statusCode: 201,
    header: {
      Location: loc(req, '/v1/metering/accumulated/usage/:id', { id: id })
    }
  };
}));

// Retrieve accumulated usage
routes.get(
  '/v1/metering/accumulated/usage/k/:organization_id/:resource_instance_id/' +
  ':plan_id/t/:day/:seq', throttle(function *(req) {
    // Retrieve and return the accumulated usage doc
    const id = dbclient.kturi([
        req.params.organization_id,
        req.params.resource_instance_id,
        req.params.plan_id
      ].join('/'), [
        req.params.day, req.params.seq
      ].join('/'));
    debug('Retrieving accumulated usage for id %s', id);
    const doc = omit(yield logdb.get(id), ['_id', '_rev']);

    return { body: doc };
  }));

// Perform recovery logic when the application starts
const recover = () => {
  // Process any unprocessed docs from our input db

  // TODO insert our recovery logic here
};

// Create an accumulator app
const accumulator = () => {
  // Configure Node cluster to use a single process as we want to serialize
  // accumulation requests per db partition and app instance
  cluster.singleton();

  // Perform recovery if needed
  recover();

  // Create the Webapp
  const app = webapp();
  app.use(routes);
  app.use(router.batch(routes));
  return app;
};

// Command line interface, create the accumulator app and listen
const runCLI = () => accumulator().listen();

// Export our public functions
module.exports = accumulator;
module.exports.runCLI = runCLI;
