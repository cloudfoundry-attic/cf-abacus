'use strict';

// Usage aggregator service.

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
const oauth = require('abacus-cfoauth');

const filter = _.filter;
const map = _.map;
const last = _.last;
const extend = _.extend;
const omit = _.omit;

const brequest = yieldable(retry(breaker(batch(request))));

const lock = yieldable(lockcb);

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-aggregator');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// Resolve service URIs
const uris = urienv({
  couchdb: 5984,
  rating: 9410
});

// Configure aggregated usage db
const aggrdb = yieldable(retry(breaker(batch(
  db.statedb(uris.couchdb, 'abacus-aggregated-usage')))));
const logdb = yieldable(retry(breaker(batch(
  db.logdb(uris.couchdb, 'abacus-aggregated-usage-log')))));

// Configure db cache
const aggrcache = yieldable(db.cache('abacus-aggregated-usage'));

const ratinguri = function *(k, t) {
  const ratingp = yieldable(db.partition());
  const p = yield ratingp(k, t, 'write');
  debug('Target rating partition %o', p);
  return /:partition:/.test(uris.rating) ? request.route(uris.rating, {
    partition: p[0]
  }) :
    /:port/.test(uris.rating) ? request.route(uris.rating, {
      partition: 9410 + p[0]
    }) : uris.rating;
};

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

// Find an element with the specified id in a list, and lazily construct and
// add a new one if no element is found
const lazyCons = (l, prop, id, cons) => {
  const f = filter(l, (e) => e[prop] === id);
  if(f.length) return f[0];
  const e = new cons(id);
  l.push(e);
  return e;
};

// Define the objects used to represent a hiearchy of aggregated usage inside
// an organization

// Represent an org, aggregated resource usage and the spaces it contains
const Org = function(id) {
  extend(this, {
    organization_id: id,
    resources: [],
    spaces: []
  });
};
const newOrg = function(id) {
  return new Org(id);
};
Org.prototype.resource = function(id) {
  return lazyCons(this.resources, 'resource_id', id, Org.Resource);
};
Org.prototype.space = function(id) {
  return lazyCons(this.spaces, 'space_id', id, Org.Space);
};

// Represent a space, aggregated resource usage and the consumers it contains
Org.Space = function(id) {
  extend(this, {
    space_id: id,
    resources: [],
    consumers: []
  });
};
Org.Space.prototype.resource = function(id) {
  return lazyCons(this.resources, 'resource_id', id, Org.Resource);
};
Org.Space.prototype.consumer = function(id) {
  return lazyCons(this.consumers, 'consumer_id', id, Org.Consumer);
};

// Represent a consumer and aggregated resource usage
Org.Consumer = function(id) {
  extend(this, {
    consumer_id: id,
    resources: []
  });
};
Org.Consumer.prototype.resource = function(id) {
  return lazyCons(this.resources, 'resource_id', id, Org.Resource);
};

// Represent a resource and its aggregated metric usage
Org.Resource = function(id) {
  extend(this, {
    resource_id: id,
    plans: [],
    aggregated_usage: []
  });
};
Org.Resource.prototype.plan = function(id) {
  return lazyCons(this.plans, 'plan_id', id, Org.Plan);
};
Org.Resource.prototype.metric = function(metric) {
  return lazyCons(this.aggregated_usage, 'metric', metric, Org.Metric);
};

// Represent a plan and its aggregated metric usage
Org.Plan = function(id) {
  extend(this, {
    plan_id: id,
    aggregated_usage: []
  });
};
Org.Plan.prototype.metric = function(metric) {
  return lazyCons(this.aggregated_usage, 'metric', metric, Org.Metric);
};

// Represent a metric aggregated usage
Org.Metric = function(metric) {
  extend(this, {
    metric: metric,
    quantity: [0, 0, 0, 0, 0, 0, 0]
  });
};

// Revive an org object
const reviveOrg = (org) => {
  org.resource = Org.prototype.resource;
  org.space = Org.prototype.space;
  map(org.resources, (s) => {
    s.plan = Org.Resource.prototype.plan;
    s.metric = Org.Resource.prototype.metric;
    map(s.plans, (s) => {
      s.metric = Org.Plan.prototype.metric;
    });
  });
  map(org.spaces, (s) => {
    s.resource = Org.Space.prototype.resource;
    s.consumer = Org.Space.prototype.consumer;
    map(s.resources, (r) => {
      r.plan = Org.Resource.prototype.plan;
      r.metric = Org.Resource.prototype.metric;
      map(r.plans, (p) => {
        p.metric = Org.Plan.prototype.metric;
      });
    });
    map(s.consumers, (c) => {
      c.resource = Org.Consumer.prototype.resource;
      map(c.resources, (r) => {
        r.plan = Org.Resource.prototype.plan;
        r.metric = Org.Resource.prototype.metric;
        map(r.plans, (p) => {
          p.metric = Org.Plan.prototype.metric;
        });
      });
    });
  });
  return org;
};

// Return a doc location given a route template and params
const loc = (req, template, parms) => req.protocol + '://' +
  req.headers.host + request.route(template, parms);

// Return the aggregate function for a given metric
const aggrfn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].aggregatefn;
};

// Aggregate usage and return new aggregated usage
const aggregate = (a, u, n, o) => {
  // Deep clone and revive the org aggregated usage object behavior
  const newa = reviveOrg(JSON.parse(JSON.stringify(a)));

  // Go through the incoming accumulated usage metrics
  map(u.accumulated_usage, (ua) => {

    // Find the aggregate function for the given metric
    const afn = aggrfn(config(u.resource_id).metrics, ua.metric);
    const aggr = (a, qty) => {
      // We're mutating the input quantity here but it's really the simplest
      // way to apply the aggregation formula
      a.quantity = map(a.quantity, (q, i) => {
        if(timescale[i] &&
          Math.floor(n / timescale[i]) - Math.floor(o / timescale[i]) >= 1)
          return afn(0, qty[i].previous || 0, qty[i].current);
        return afn(q, qty[i].previous || 0, qty[i].current);
      });
    };

    // Apply the aggregate function to the aggregated usage tree
    aggr(
      newa.resource(u.resource_id).metric(ua.metric), ua.quantity);
    aggr(
      newa.resource(u.resource_id).plan(u.plan_id)
      .metric(ua.metric), ua.quantity);
    aggr(
      newa.space(u.space_id).resource(u.resource_id)
      .metric(ua.metric), ua.quantity);
    aggr(newa.space(u.space_id).resource(u.resource_id).plan(u.plan_id)
      .metric(ua.metric), ua.quantity);
    aggr(newa.space(u.space_id).consumer(
        u.consumer ? u.consumer.consumer_id : 'ALL')
        .resource(u.resource_id).metric(ua.metric), ua.quantity);
    aggr(newa.space(u.space_id).consumer(
      u.consumer ? u.consumer.consumer_id : 'ALL')
      .resource(u.resource_id).plan(u.plan_id).
        metric(ua.metric), ua.quantity);
  });

  // Remove aggregated usage object behavior and return
  const jsa = JSON.parse(JSON.stringify(newa));
  debug('New aggregated usage %o', jsa);
  return jsa;
};

// Return the last aggregated usage for an org in a given time period
const aggregatedUsage = function *(id) {
  debug('Retrieving aggregated usage for %s', id);
  const doc = (yield aggrcache.get(id)) || (yield aggrdb.get(id));
  if(doc)
    debug('Found aggregated usage %o in %s', doc, doc.dbrev ? 'cache' : 'db');
  else
    debug('No existing aggregated usage');
  return doc;
};

// Log accumulated usage
const logAggregatedUsage = function *(alogdoc) {
  debug('Logging aggregated usage %s', alogdoc.id);
  yield logdb.put(alogdoc);

  debug('Logged aggregated usage %o', alogdoc);
  return alogdoc;
};

// Update the aggregated usage
const storeAggregatedUsage = function *(a, aid, alogid, uid) {
  debug('Updating aggregated usage %s', aid);
  const adoc = extend({}, omit(a, 'dbrev'), {
    id: aid,
    last_aggregated_usage_id: alogid,
    accumulated_usage_id: uid
  });

  // Store the aggregated usage in the db
  const arev = yield aggrdb.put(
    extend({}, adoc, a.dbrev ? { _rev: a.dbrev } : {}));

  // Store it in the cache as well, with the rev we got from the db
  yield aggrcache.put(
    extend({}, adoc, { dbrev: arev.rev }));

  debug('Updated aggregated usage %o', adoc);
  return aid;
};

// Get aggregated usage, update and store it
const updateAggregatedUsage =
  yieldable(batch(batch.groupBy(function *(calls) {
    const aid = calls[0][0].aid;
    debug('Update aggregated usage for a group of %d usage docs with id %s',
      calls.length, aid);

    // Lock based on the given org and time period
    const unlock = yield lock(aid);
    try {
      // Retrieve last aggregated usage for the given org and time
      const a = yield aggregatedUsage(aid);

      // Aggregate usage, starting with the initial one
      let newa = a ? omit(a,
        'last_aggregated_usage_id') : newOrg(calls[0][0].u.organization_id);

      const ares = map(calls, (call) => {
        const newend = dateUTCNumbify(call[0].u.end);
        const oldend = dateUTCNumbify(newa.end) || 0;
        newa = extend(newa,
          { start: call[0].u.end, end: call[0].u.end });
        newa = aggregate(newa, call[0].u, newend, oldend);
        return [undefined, omit(newa, 'dbrev')];
      });

      // Store the final new aggregated usage
      const lcall = last(calls);
      yield storeAggregatedUsage(newa, aid, lcall[0].alogid, lcall[0].uid);

      return ares;
    }
    finally {
      unlock();
    }
  }, function *(args) {
    // Group calls by aggregated usage id
    return args[0].aid;
  })));

// Aggregate the given accumulated usage
const aggregateUsage = function *(u) {
  // Compute the usage log id and aggregated usage id
  const aid = dbclient.kturi(u.organization_id, 0);
  const alogid = dbclient.kturi(u.organization_id,
    [u.end, seqid()].join('/'));
  const uid = u.id;

  const newa = yield updateAggregatedUsage({
    u: u, aid: aid, alogid: alogid, uid: uid });

  // Log the new aggregated usage
  const alogdoc = extend(dbclient.undbify(newa), {
    id: alogid,
    accumulated_usage_id: u.id
  });

  // Post the new aggregated usage to the rating service
  yieldable.functioncb(brequest.post)(
    (yield ratinguri(alogdoc.organization_id, alogdoc.start)) +
      '/v1/rating/usage',
    {
      body: alogdoc
    }, (err, res) => {
      if(err)
        debug('Failed to post %s to rating service, %o', alogid, err);
    });

  yield logAggregatedUsage(alogdoc, alogid);
  return alogid;
};

// Create an express router
const routes = router();

// Aggregate accumulated usage for a given resource instance
routes.post('/v1/metering/accumulated/usage', throttle(function *(req) {
  const u = req.body;

  // Aggregate usage
  debug('Aggregating usage %o', u);
  const id = yield aggregateUsage(u);

  // Return the location of the new aggregated usage
  return {
    statusCode: 201,
    header: {
      Location: loc(req, '/v1/metering/aggregated/usage/:id', {
        id: id
      })
    }
  };
}));

// Retrieve aggregated usage
routes.get(
  '/v1/metering/aggregated/usage/k/:organization_id/t/:day/:seq',
  throttle(function *(req) {
    const id = dbclient.kturi(req.params.organization_id,
      [req.params.day, req.params.seq].join('/'));
    debug('Retrieving aggregated usage for id %s', id);

    // Retrieve and return the aggregated usage doc
    const doc = dbclient.undbify(yield logdb.get(id));
    return {
      body: doc
    };
  }));

// Perform recovery logic when the application starts
const recover = () => {
  // Process any unprocessed docs from our input db

  // TODO insert our recovery logic here
};

// Create an aggregator app
const aggregator = () => {
  // Configure Node cluster to use a single process as we want to serialize
  // accumulation requests per db partition and app instance
  cluster.singleton();

  // Perform recovery if needed
  recover();

  // Create the Webapp
  const app = webapp();

  // Secure metering and batch routes using an OAuth bearer access token
  if (secured())
    app.use(/^\/v1\/metering|^\/batch$/,
      oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  app.use(routes);
  app.use(router.batch(routes));
  return app;
};

// Command line interface, create the aggregator app and listen
const runCLI = () => aggregator().listen();

// Export our public functions
module.exports = aggregator;
module.exports.newOrg = newOrg;
module.exports.reviveOrg = reviveOrg;
module.exports.runCLI = runCLI;
