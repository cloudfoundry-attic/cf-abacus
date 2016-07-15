'use strict';

// Usage aggregator service.

const _ = require('underscore');
const webapp = require('abacus-webapp');
const cluster = require('abacus-cluster');
const router = require('abacus-router');
const yieldable = require('abacus-yieldable');
const urienv = require('abacus-urienv');
const seqid = require('abacus-seqid');
const oauth = require('abacus-oauth');
const mconfigcb = require('abacus-metering-config');
const rconfigcb = require('abacus-rating-config');
const timewindow = require('abacus-timewindow');

const transform = require('abacus-transform');
const dataflow = require('abacus-dataflow');
const dbclient = require('abacus-dbclient');

const filter = _.filter;
const find = _.find;
const map = _.map;
const last = _.last;
const extend = _.extend;
const rest = _.rest;
const indexOf = _.indexOf;
const object = _.object;

const treduce = yieldable(transform.reduce);

const mconfig = yieldable(mconfigcb);
const rconfig = yieldable(rconfigcb);

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-aggregator');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// OAuth bearer access token with Abacus system access scopes
let systemToken;

// Resolve service URIs
const uris = urienv({
  auth_server: 9882,
  sink: undefined
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

const igroups = (udoc) =>
  [udoc.organization_id,
    [udoc.organization_id, udoc.space_id, udoc.consumer_id || 'UNKNOWN']
    .join('/'),
    [udoc.organization_id, udoc.resource_instance_id,
      udoc.consumer_id || 'UNKNOWN', udoc.plan_id, udoc.metering_plan_id,
      udoc.rating_plan_id, udoc.pricing_plan_id].join('/')];

const okeys = (udoc, ikey) =>
  [udoc.organization_id,
    [udoc.organization_id, udoc.space_id,
      udoc.consumer_id || 'UNKNOWN'] .join('/'),
    [udoc.organization_id, udoc.resource_instance_id,
      udoc.consumer_id || 'UNKNOWN', udoc.plan_id, udoc.metering_plan_id,
      udoc.rating_plan_id, udoc.pricing_plan_id].join('/')];

const skeys = (udoc) =>
  [udoc.account_id, udoc.account_id, undefined];

// Configure reduction result doc sampling, to store reduction results
// in a single doc per min, hour or day for example instead of creating
// a new doc for each new result
const sampling = parseInt(process.env.SAMPLING) || 1;

const otimes = (udoc, itime) =>
  [seqid.sample(itime, sampling), seqid.sample(itime, sampling),
    map([udoc.start, udoc.end], seqid.pad16).join('/')];

const stimes = (udoc, itime) =>
  [seqid.sample(itime, sampling), undefined];

// The scaling factor of each time window for creating the date string
// [Second, Minute, Hour, Day, Month]
const slack = () => /^[0-9]+[MDhms]$/.test(process.env.SLACK) ? {
  scale : process.env.SLACK.charAt(process.env.SLACK.length - 1),
  width : process.env.SLACK.match(/[0-9]+/)[0]
} : {
  scale : 'm',
  width : 10
};

// Time dimension keys corresponding to their respective window positions
const dimensions = ['s', 'm', 'h', 'D', 'M'];

// Checks if a consumer usage should be pruned from the aggregated usage
// based upon whether the current time exceeds 2 months + slack
const shouldNotPrune = (time) => {
  const d = new Date(time);
  const prunescales = [d.getUTCFullYear(), d.getUTCMonth() + 2, d.getUTCDate(),
    d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(),
    d.getUTCMilliseconds()];
  prunescales[5 - indexOf(dimensions, slack().scale)] += slack().width;
  return Date.UTC.apply(null, prunescales) > new Date().getTime();
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
Org.Space.prototype.consumer = function(id, doctime) {
  // Construct or retrieve the consumer object
  const consumer = lazyCons(this.consumers, 'id', id, Org.Consumer);
  consumer.t = doctime;
  this.consumers = filter(this.consumers, (c) =>
    shouldNotPrune(c.t.match(/(\d+)/)[0]));
};



// Represent a consumer reference
// id represents consumer_id
// t represents time component of the consumer aggregated doc id.
Org.Consumer = function(id) {
  extend(this, {
    id: id
  });
};

// Represent a consumer and aggregated resource usage
const Consumer = function(id) {
  extend(this, {
    consumer_id: id,
    resources: []
  });
};
const newConsumer = function(id) {
  return new Consumer(id);
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
  }, object(
    ['metering_plan_id', 'rating_plan_id', 'pricing_plan_id'],
    rest(id.split('/'))
  ));
};
Org.Plan.prototype.metric = function(metric) {
  return lazyCons(this.aggregated_usage, 'metric', metric, Org.Metric);
};

// Represent a metric based aggregation windows
Org.Metric = function(metric) {
  extend(this, {
    metric: metric,
    windows: [
      [null],
      [null],
      [null],
      [null],
      [null]
    ]
  });
};

Consumer.Resource = function(id) {
  extend(this, {
    resource_id: id,
    plans: [],
    aggregated_usage: []
  });
};

Consumer.prototype.resource = function(id) {
  return lazyCons(this.resources, 'resource_id', id, Consumer.Resource);
};

Consumer.Resource.prototype.metric = function(metric) {
  return lazyCons(this.aggregated_usage, 'metric', metric, Org.Metric);
};

Consumer.Plan = function(id) {
  extend(this, {
    plan_id: id,
    aggregated_usage: [],
    resource_instances: []
  }, object(
    ['metering_plan_id', 'rating_plan_id', 'pricing_plan_id'],
    rest(id.split('/'))
  ));
};

Consumer.Resource.prototype.plan = function(id) {
  return lazyCons(this.plans, 'plan_id', id, Consumer.Plan);
};

Consumer.Plan.prototype.metric = function(metric) {
  return lazyCons(this.aggregated_usage, 'metric', metric, Org.Metric);
};

// Represent a resource instance reference
Consumer.ResourceInstance = function(rid) {
  extend(this, {
    id: rid
  });
};

Consumer.Plan.prototype.resource_instance = function(rid, time, processed) {
  const instance = lazyCons(this.resource_instances, 'id', rid,
    Consumer.ResourceInstance);
  instance.t = time;
  instance.p = processed;
  this.resource_instances = filter(this.resource_instances,
    (ri) => shouldNotPrune(ri.p));
  return instance;
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
  });
  return org;
};

// Revive a consumer object
const reviveCon = (con) => {
  con.resource = Consumer.prototype.resource;
  map(con.resources, (r) => {
    r.plan = Consumer.Resource.prototype.plan;
    r.metric = Consumer.Resource.prototype.metric;
    map(r.plans, (p) => {
      p.metric = Consumer.Plan.prototype.metric;
      p.resource_instance = Consumer.Plan.prototype.resource_instance;
    });
  });
  return con;
};

// Return the configured price for the metrics that is attached in the
// usage document
const price = (pricings, metric) =>
  filter(pricings, (m) => m.name === metric)[0].price;

// Return the rate function for a given metric
const ratefn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].ratefn;
};

// Return the aggregate function for a given metric
const aggrfn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].aggregatefn;
};

// Shifts a single resource's aggregated usage
const shiftResources = (resources, oldend, newend) => {
  const shiftAggregatedUsage = (aggregated) => {
    map(aggregated, (au) => {
      map(au.windows, (w, i) => {
        timewindow.shiftWindow(oldend, newend, w, dimensions[i]);
      });
    });
  };

  // Shift both the resource aggregated usage and plan aggregated usage
  map(resources, (resource) => {
    shiftAggregatedUsage(resource.aggregated_usage);
    map(resource.plans, (plan) => {
      shiftAggregatedUsage(plan.aggregated_usage);
    });
  });
};

// Shift an aggregated usage object
const shift = (newa, a, processed) => {
  if(a && a.processed && processed - (a ? a.processed : 0) >= 0) {
    const oldend = new Date(a.processed);
    const newend = new Date(processed);
    shiftResources(newa.resources, oldend, newend);
    map(newa.spaces, (space) => {
      shiftResources(space.resources, oldend, newend);
    });
  }
};

// find info with error and reason to redirect
// usage to error db and stop processing it to the next pipeline.
const findError = (info) => find(info, (i) => i.error);

// Aggregate usage and return new aggregated usage
const aggregate = function *(aggrs, u) {
  debug(
    'Aggregating usage %o from %d and new usage %o from %d',
    aggrs[0], aggrs[0] ? aggrs[0].end : 0, u, u.end);

  // Aggregate usage into two docs, the first one contains usage at the
  // org level, the second one contains usage at the consumer level
  const a = aggrs[0];
  const c = aggrs[1];

  // Retrieve the metering plan and rating plan
  const [mplan, rplan] = yield [
    mconfig(u.metering_plan_id, systemToken && systemToken()),
    rconfig(u.rating_plan_id, systemToken && systemToken())
  ];

  // find errors
  const e = findError([mplan, rplan]);

  if(e) {
    debug('The usage submitted has business errors %o', e);
    return [extend({}, u, e)];
  }

  // Compute the aggregated usage time and new usage time
  const newend = u.processed;
  const docend = u.end;

  // Deep clone and revive the org aggregated usage object behavior
  const newa = a ?
    extend(reviveOrg(JSON.parse(JSON.stringify(a))), {
      account_id: u.account_id,
      start: u.start,
      end: u.end,
      resource_instance_id: u.resource_instance_id,
      consumer_id: u.consumer_id
    }) :
    extend(newOrg(u.organization_id), {
      account_id: u.account_id,
      start: u.start,
      end: u.end,
      resource_instance_id: u.resource_instance_id,
      consumer_id: u.consumer_id
    });

  const newc = c ? reviveCon(JSON.parse(JSON.stringify(c))) :
    newConsumer(u.consumer_id || 'UNKNOWN');
  extend(newc, {
    start: u.start,
    end: u.end,
    organization_id: u.organization_id,
    resource_instance_id: u.resource_instance_id
  });

  // An empty doc only used to detect duplicate usage
  const iddoc = {
  };

  shift(newa, a, u.processed);
  shift(newc, c, u.processed);

  // Go through the incoming accumulated usage metrics
  map(u.accumulated_usage, (ua) => {
    // Find the aggregate function for the given metric
    const afn = aggrfn(mplan.metering_plan.metrics, ua.metric);

    // Find the rate function for the given metric
    const rfn = ratefn(rplan.rating_plan.metrics, ua.metric);

    // Find the price for the metric
    const rp = price(u.prices.metrics, ua.metric);

    // getCell on incoming usage's time windows
    const accGetCell = timewindow.cellfn(ua.windows, newend, docend);

    const aggr = (am, addCost) => {
      // getCell on previous aggregated usage's time windows
      const aggGetCell = timewindow.cellfn(am.windows, newend, docend);
      // We're mutating the input windows property here
      // but it's really the simplest way to apply the aggregation formula
      am.windows = map(am.windows, (w, i) => {
        // If the number of slack windows in the aggregated usage is less than
        // the number in the incoming accumulated usage, push until they equal
        if(w.length < ua.windows[i].length)
          map(Array(ua.windows[i].length - w.length), () =>
            w.push(null));

        const twi = timewindow.timeWindowIndex(w, new Date(newend),
          new Date(docend), dimensions[i]);

        /* eslint complexity: [1, 6] */
        const quantities = map(w, (q, j) => {
          // Instead of returning undefined or null,
          // returning previously aggregated quantity
          // TODO: Calculation has to use slack window to determine
          // what to do here
          if(!ua.windows[i][j] || twi !== j)
            return q;

          return {
            quantity: afn(q && q.quantity || 0,
              ua.windows[i][j].quantity.previous || 0,
              ua.windows[i][j].quantity.current, aggGetCell, accGetCell)
          };
        });

        return addCost ? map(quantities, (q) => q ?
          extend(q, { cost: q.quantity ?
            rfn(rp, q.quantity) : 0 }) : null) : quantities;
      });

    };

    // Apply the aggregate function to the aggregated usage tree
    const pid = [u.plan_id, u.metering_plan_id, u.rating_plan_id,
      u.pricing_plan_id].join('/');
    aggr(
      newa.resource(u.resource_id).metric(ua.metric), false);
    aggr(
      newa.resource(u.resource_id).plan(pid)
      .metric(ua.metric), true);
    aggr(
      newa.space(u.space_id).resource(u.resource_id)
      .metric(ua.metric), false);
    aggr(
      newa.space(u.space_id).resource(u.resource_id).plan(pid)
      .metric(ua.metric), true);

    // Apply the aggregate function to the consumer usage tree
    newa.space(u.space_id).consumer(u.consumer_id || 'UNKNOWN',
      seqid.sample(dbclient.t(u.id), sampling));
    aggr(newc.resource(u.resource_id).metric(ua.metric), false);
    aggr(newc.resource(u.resource_id).plan(pid).metric(ua.metric), true);
    newc.resource(u.resource_id).plan(pid).resource_instance(
      u.resource_instance_id,
      dbclient.t(u.accumulated_usage_id), u.processed);
  });

  shift(newa, u, parseInt(u.processed_id));
  shift(newc, u, parseInt(u.processed_id));

  // Remove aggregated usage object behavior and return
  const jsa = JSON.parse(JSON.stringify([newa, newc, iddoc]));
  debug('New aggregated usage %o', jsa);
  return jsa;
};

// Aggregate the given accumulated usage
// Process a group of usage docs and compute the corresponding
// aggregated usage
const aggregateUsage = function *(aggrs, udocs) {
  const ologs = yield treduce(udocs, function *(log, udoc, i, l) {
    const res = yield aggregate(last(log), udoc);
    return log.concat([res]);
  }, [
    aggrs
  ]);
  return rest(ologs);
};

// Create an aggregator service app
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
      get: '/v1/metering/accumulated/usage/t/:tseq/k/:korganization_id',
      dbname: 'abacus-aggregator-accumulated-usage',
      wscope: iwscope,
      rscope: rscope,
      key: ikey,
      time: itime,
      groups: igroups
    },
    output: {
      type: 'aggregated_usage',
      get: '/v1/metering/aggregated/usage/k/:korganization_id/t/:tseq',
      dbname: 'abacus-aggregator-aggregated-usage',
      rscope: rscope,
      keys: okeys,
      times: otimes
    },
    sink: {
      host: process.env.SINK ? uris.sink : undefined,
      apps: process.env.AGGREGATOR_SINK_APPS,
      posts: ['/v1/metering/aggregated/usage',
        '/v1/metering/aggregated/usage', undefined],
      keys: skeys,
      times: stimes,
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
    systemToken = oauth.cache(uris.auth_server, process.env.CLIENT_ID,
      process.env.CLIENT_SECRET, 'abacus.usage.write abacus.usage.read');

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
