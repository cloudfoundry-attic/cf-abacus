'use strict';

// Usage aggregator service.

const _ = require('underscore');
const webapp = require('abacus-webapp');
const cluster = require('abacus-cluster');
const router = require('abacus-router');
const yieldable = require('abacus-yieldable');
const urienv = require('abacus-urienv');
const seqid = require('abacus-seqid');
const oauth = require('abacus-cfoauth');
const configcb = require('abacus-resource-config');
const transform = require('abacus-transform');
const dataflow = require('abacus-dataflow');

const filter = _.filter;
const map = _.map;
const last = _.last;
const extend = _.extend;
const rest = _.rest;

const tmap = yieldable(transform.map);
const treduce = yieldable(transform.reduce);

const config = yieldable(configcb);

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-aggregator');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// OAuth bearer access token with Abacus system access scopes
let systemToken;

// Resolve service URIs
const uris = urienv({
  couchdb: 5984,
  authserver: 9382,
  rating: 9410
});

// Return OAuth system scopes needed to write input docs
const iwscope = (udoc) => secured() ? {
  system: ['abacus.usage.write']
} : undefined;

// Return OAuth system scopes needed to read input and output docs
const rscope = (udoc) => secured() ? {
  system: ['abacus.usage.read']
} : undefined;

// Return the keys and times of our docs
const ikey = (udoc) => 
  udoc.organization_id;

const itime = (udoc) => 
  seqid();

const okey = (udoc) => 
  udoc.organization_id;

const ogroup = (udoc) => 
  udoc.organization_id;

const otime = (udoc) => 
  seqid();

// The scaling factor of each time window for creating the date string
// [Second, Minute, Hour, Day, Month, Year, Forever]
const timescale = [1, 100, 10000, 1000000, 100000000];

// Converts a millisecond number to a format a number that is YYYYMMDDHHmmSS
const dateUTCNumbify = (t) => {
  const d = new Date(t);
  return d.getUTCFullYear() * 10000000000 + d.getUTCMonth() * timescale[4]
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
    quantity: [[0], [0], [0], [0], [0]]
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

// Return the aggregate function for a given metric
const aggrfn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].aggregatefn;
};

// Aggregate usage and return new aggregated usage
const aggregate = function *(a, u, auth) {
  debug(
    'Aggregating usage %o from %d and new usage %o from %d',
    a, a ? a.end : 0, u, u.end);

  // Compute the aggregated usage time and new usage time
  const newend = dateUTCNumbify(u.processed);
  const oldend = a ? dateUTCNumbify(a.processed) : 0;

  // Deep clone and revive the org aggregated usage object behavior
  const newa = a ?
    extend(reviveOrg(JSON.parse(JSON.stringify(a))), {
      end: u.end
    }) :
    extend(newOrg(u.organization_id), {
      start: u.start,
      end: u.end,
      region: u.region
    });

  // Go through the incoming accumulated usage metrics
  yield tmap(u.accumulated_usage, function *(ua) {

    // Find the aggregate function for the given metric
    const conf = yield config(u.resource_id, u.end,
      systemToken && systemToken());

    const afn = aggrfn(conf.metrics, ua.metric);
    const aggr = (a, qty) => {
      // We're mutating the input quantity here but it's really the simplest
      // way to apply the aggregation formula
      a.quantity = map(a.quantity, (w, i) => {
        if(w.length < qty[i].length)
          map(Array(qty[i].length - w.length), () => w.push(0));
        return map(w, (q, j) => {
          if(!qty[i][j])
            return qty[i][j];
          if(Math.floor(newend / timescale[i]) -
            Math.floor(oldend / timescale[i]) >= 1)
            return afn(0, qty[i][j].previous || 0, qty[i][j].current);

          return afn(q, qty[i][j].previous || 0, qty[i][j].current);
        });
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
    aggr(
      newa.space(u.space_id).resource(u.resource_id).plan(u.plan_id)
      .metric(ua.metric), ua.quantity);
    aggr(
      newa.space(u.space_id).consumer(
        u.consumer ? u.consumer.consumer_id : 'ALL')
        .resource(u.resource_id).metric(ua.metric), ua.quantity);
    aggr(
      newa.space(u.space_id).consumer(
        u.consumer ? u.consumer.consumer_id : 'ALL')
        .resource(u.resource_id).plan(u.plan_id).
          metric(ua.metric), ua.quantity);
  });

  // Remove aggregated usage object behavior and return
  const jsa = JSON.parse(JSON.stringify(newa));
  debug('New aggregated usage %o', jsa);
  return jsa;
};

// Aggregate the given accumulated usage
// Process a group of usage docs and compute the corresponding
// aggregated usage
const aggregateUsage = function *(aggr, udocs, auth) {
  const ologs = yield treduce(udocs, function *(log, udoc, i, l) {
    const res = yield aggregate(last(log)[0], udoc, auth);
    return log.concat([[res]]);

  }, [[
    aggr
  ]]);
  return rest(ologs);
};

// Create an aggregator app
const aggregator = () => {
  // Configure Node cluster to use a single process as we want to serialize
  // accumulation requests per db partition and app instance
  cluster.singleton();

  // Create the Webapp
  const app = webapp();

  // Secure metering and batch routes using an OAuth bearer access token
  if (secured())
    app.use(/^\/v1\/metering|^\/batch$/,
      oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  const reducer = dataflow.reducer(aggregateUsage, {
    input: {
      type: 'accumulated_usage',
      post: '/v1/metering/accumulated/usage',
      get: '/v1/metering/accumulated/usage/k/:korganization_id/t/:tseq',
      dbname: 'abacus-aggregator-accumulated-usage',
      wscope: iwscope,
      rscope: rscope,
      key: ikey,
      time: itime
    },
    output: {
      type: 'aggregated_usage',
      get: '/v1/metering/aggregated/usage/k/:korganization_id/t/:tseq',
      dbname: 'abacus-aggregator-aggregated-usage',
      rscope: rscope,
      key: okey,
      time: otime,
      group: ogroup
    },
    sink : {
      host: uris.rating,
      port: 9410,
      post: '/v1/rating/aggregated/usage',
      authentication: systemToken
    }
  });

  app.use(reducer);
  app.use(router.batch(app));

  app.reducer = reducer;
  return app;
};

// Command line interface, create the aggregator app and listen
const runCLI = () => {
  // Cache and schedule the system token renewal
  if (secured()) {
    systemToken = oauth.cache(uris.authserver, process.env.CLIENTID,
      process.env.CLIENTSECRET, 'abacus.usage.write abacus.usage.read');

    systemToken.start();
  }

  // Create the app, replay any failed events, and listen
  const app = aggregator();
  dataflow.replay(app.reducer, 0, () => {
    app.listen();
  });
};

// Export our public functions
module.exports = aggregator;
module.exports.newOrg = newOrg;
module.exports.reviveOrg = reviveOrg;
module.exports.runCLI = runCLI;
