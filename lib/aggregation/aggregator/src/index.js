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
const transform = require('abacus-transform');
const throttle = require('abacus-throttle');
const request = require('abacus-request');
const urienv = require('abacus-urienv');
const seqid = require('abacus-seqid');
const lockcb = require('abacus-lock');
const db = require('abacus-aggregation-db');
const config = require('abacus-resource-config');

const filter = _.filter;
const map = _.map;
const zip = _.zip;
const flatten = _.flatten;
const last = _.last;
const clone = _.clone;
const extend = _.extend;
const omit = _.omit;
const values = _.values;
const sortBy = _.sortBy;
const groupBy = _.groupBy;

const brequest = batch(request);
const post = yieldable(retry(breaker(brequest.noWaitPost)));

const lock = yieldable(lockcb);

/* eslint camelcase: 1 */
/* eslint no-eval: 1 */
/* jshint evil: true */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-aggregator');

// Resolve service URIs
const uris = urienv({
  couchdb: 5984,
  rating: 9410
});

// Configure aggregated usage db
const aggrdb = yieldable(
  retry(breaker(db(uris.couchdb, 'abacus-aggregated-usage'))));
const logdb = yieldable(
  retry(breaker(batch(db(uris.couchdb, 'abacus-aggregated-usage-log')))));

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

// Find an element with the specified id in a list, and lazily construct and
// add a new one if no element is found
const lazyCons = (l, id, cons, prop) => {
  const f = filter(l, e => e[prop || 'id'] === id);
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
  return lazyCons(this.resources, id, Org.Resource);
};
Org.prototype.space = function(id) {
  return lazyCons(this.spaces, id, Org.Space);
};

// Represent a space, aggregated resource usage and the consumers it contains
Org.Space = function(id) {
  extend(this, {
    id: id,
    resources: [],
    consumers: []
  });
};
Org.Space.prototype.resource = function(id) {
  return lazyCons(this.resources, id, Org.Resource);
};
Org.Space.prototype.consumer = function(id) {
  return lazyCons(this.consumers, id, Org.Consumer);
};

// Represent a consumer and aggregated resource usage
Org.Consumer = function(id) {
  extend(this, {
    id: id,
    resources: []
  });
};
Org.Consumer.prototype.resource = function(id) {
  return lazyCons(this.resources, id, Org.Resource);
};

// Represent a resource and its aggregated metric usage
Org.Resource = function(id) {
  extend(this, {
    id: id,
    plans: [],
    aggregated_usage: []
  });
};
Org.Resource.prototype.plan = function(id) {
  return lazyCons(this.plans, id, Org.Plan);
};
Org.Resource.prototype.metric = function(unit) {
  return lazyCons(this.aggregated_usage, unit, Org.Metric, 'unit');
};

// Represent a plan and its aggregated metric usage
Org.Plan = function(id) {
  extend(this, {
    id: id,
    aggregated_usage: []
  });
};
Org.Plan.prototype.metric = function(unit) {
  return lazyCons(this.aggregated_usage, unit, Org.Metric, 'unit');
};

// Represent a metric aggregated usage
Org.Metric = function(unit) {
  extend(this, {
    unit: unit,
    quantity: 0
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

// Return the aggregation start time for a given time
const day = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// Return the aggregation end time for a given time
const eod = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(),
    d.getUTCDate() + 1) - 1;
};

// Return a function that returns an aggregate function for a resource
const aggrfn = (rid) => {
  // Get all transforms for a given resource id
  const aggs = (config(rid) || {
    transforms: []
  }).transforms;
  return (u) => {
    // Find the transform with matching unit as id
    const f = filter(aggs, (agg) => agg.id === u);
    // Used the configured aggregate function or default to the sum function
    return f.length && f[0].aggregate ?
      eval('(' + f[0].aggregate + ')') : (a, qty) => a ? a + qty : qty;
  };
};

// Aggregate usage and return new aggregated usage
const aggregate = (a, u) => {
  // Deep clone and revive the org aggregated usage object behavior
  const newa = reviveOrg(JSON.parse(JSON.stringify(a)));

  const rafn = aggrfn(u.resource_id);

  // Go through the incoming accumulated usage unit and quantity
  map(u.accumulated_usage, (ua) => {
    const unit = ua.unit;
    const delta = ua.delta;

    // Find the aggregate function for a given unit and use it to aggregate
    // the quantity
    const afn = (a, delta) => {
      // We're mutating the input quantity here but it's really the simplest
      // way to apply the aggregation formula
      a.quantity = rafn(a.unit)(a.quantity, delta);
    };

    afn(newa.resource(u.resource_id).metric(unit), delta);
    afn(newa.resource(u.resource_id).plan(u.plan_id).metric(unit), delta);
    afn(
      newa.space(u.space_id).resource(u.resource_id).metric(unit), delta);
    afn(
      newa.space(u.space_id).resource(u.resource_id).plan(u.plan_id)
      .metric(unit), delta);
    afn(
      newa.space(u.space_id).consumer(u.consumer ? u.consumer.value : 'all')
      .resource(u.resource_id).metric(unit), delta);
    afn(
      newa.space(u.space_id).consumer(u.consumer ? u.consumer.value : 'all')
      .resource(u.resource_id).plan(u.plan_id).metric(unit), delta);
  });

  // Remove org aggregated usage object behavior and return
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
const logAggregatedUsage = function *(alogdoc, alogid) {
  debug('Logging aggregated usage %s', alogid);
  yield logdb.put(extend(clone(alogdoc), {
    _id: alogid
  }));
  debug('Logged aggregated usage %o', alogdoc);
  return alogdoc;
};

// Update the aggregated usage
const storeAggregatedUsage = function *(a, aid, alogid, uid) {
  debug('Updating aggregated usage %s', aid);
  const adoc = extend(clone(omit(a, 'dbrev')), {
    id: aid,
    last_aggregated_usage_id: alogid,
    accumulated_usage_id: uid
  });
  const arev = yield aggrdb.put(extend(clone(adoc), {
    _id: aid
  }, a.dbrev ? {
    _rev: a.dbrev
  } : {}));
  yield aggrcache.put(extend(clone(adoc), {
    _id: aid,
    dbrev: arev.rev
  }));
  debug('Updated aggregated usage %o', adoc);
  return aid;
};

// Get aggregated usage, update and store it
const updateAggregatedUsage = function *(aid, udocs) {
  debug('Update aggregated usage for a group of %d usage docs', udocs.length);
  // Lock based on the given org and time period
  const unlock = yield lock(aid);
  try {
    // Retrieve last aggregated usage for the given org and time
    const a = yield aggregatedUsage(aid);

    // Aggregate usage, starting with the initial one
    // Remove last_aggregated_usage_id to avoid writing this property to
    // aggregated usage log
    let newa = a ? omit(a,
      'last_aggregated_usage_id') : newOrg(udocs[0].u.organization_id);

    const adocs = map(udocs, (udoc) => {
      newa = extend(newa, { start: day(udoc.u.end), end: eod(udoc.u.end) });
      newa = aggregate(newa, udoc.u);
      return newa;
    });

    // Store the final new aggregated usage
    const ludoc = last(udocs);
    yield storeAggregatedUsage(newa, aid, ludoc.alogid, ludoc.uid);

    return adocs;
  }
  finally {
    unlock();
  }
};

// Aggregate usage by batching individual calls and then
// by grouping them using the given org and time period
const batchAggregateUsage = yieldable(batch((b, cb) => {
  // Map individual aggregated usage into a batch response array and
  // then call the callback
  const bcb = (err, adocs) => err ?
    cb(err) : cb(null, map(adocs, (adoc) => [null, adoc]));

  transform.map(b, (args, i, b, mcb) => {
    // Map individual call arguments into a call object
    mcb(null, { i: i, aid: args[1],
      udoc: { u: args[0], alogid: args[2], uid: args[3] } });
  }, (err, objs) => {
    if (err) return cb(err);

    // Group the transformed call objects using the given org and time period
    const groups = values(groupBy(objs, (obj) => obj.aid));

    // Call updateAggregatedUsage for each group
    transform.map(groups, (group, i, groups, mcb) => {
      yieldable.functioncb(updateAggregatedUsage)(group[0].aid,
        map(group, (obj) => obj.udoc), (err, adocs) => {
          // Zip grouped call objects with corresponding aggregated usage
          return mcb(null, zip(group,
            err ? map(group, (obj) => ({ error: err })) : adocs));
        });
    }, (err, objs) => {
      if (err) return bcb(err);

      // Order the zipped call objects using the original call index of
      // the batch and then return the ordered aggregated usage
      bcb(null, map(sortBy(flatten(objs, true), (obj) => obj[0].i),
        (obj) => obj[1]));
    });
  });
}));

// Aggregate the given accumulated usage
const aggregateUsage = function *(u) {
  // Compute the usage log id and aggregated usage id
  const aid = dbclient.kturi(u.organization_id, day(u.end));
  const alogid = dbclient.kturi(u.organization_id,
    [day(u.end), seqid()].join('-'));
  const uid = u.id;

  const newa = yield batchAggregateUsage(u, aid, alogid, uid);

  // Log the new aggregated usage
  const alogdoc = extend(clone(omit(newa, 'dbrev', '_rev')), {
    id: alogid,
    accumulated_usage_id: u.id
  });
  yield post((yield ratinguri(alogdoc.organization_id, alogdoc.start)) +
    '/v1/rating/usage', {
      body: alogdoc
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
routes.get('/v1/metering/aggregated/usage/:id', throttle(function *(req) {
  debug('Retrieving aggregated usage for id %s', req.params.id);

  // Retrieve and return the aggregated usage doc
  const doc = omit(yield logdb.get(req.params.id), ['_id', '_rev']);
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

