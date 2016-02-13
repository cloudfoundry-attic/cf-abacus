'use strict';

// Usage accumulator service.

const _ = require('underscore');
const webapp = require('abacus-webapp');
const cluster = require('abacus-cluster');
const router = require('abacus-router');
const yieldable = require('abacus-yieldable');
const urienv = require('abacus-urienv');
const oauth = require('abacus-oauth');
const mconfigcb = require('abacus-metering-config');
const rconfigcb = require('abacus-rating-config');
const transform = require('abacus-transform');
const dataflow = require('abacus-dataflow');
const seqid = require('abacus-seqid');
const timewindow = require('abacus-timewindow');

const map = _.map;
const last = _.last;
const extend = _.extend;
const omit = _.omit;
const filter = _.filter;
const rest = _.rest;

const treduce = yieldable(transform.reduce);

const mconfig = yieldable(mconfigcb);
const rconfig = yieldable(rconfigcb);

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-accumulator');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// OAuth bearer access token with Abacus system access scopes
let systemToken;

// Resolve service URIs
const uris = urienv({
  auth_server: 9882,
  aggregator: 9300
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
  [udoc.organization_id, udoc.resource_instance_id,
    udoc.consumer_id || 'UNKNOWN', udoc.plan_id].join('/');

const itime = (udoc) =>
  seqid();

const igroups = (udoc) =>
  [[udoc.organization_id, udoc.resource_instance_id,
    udoc.consumer_id || 'UNKNOWN', udoc.plan_id, udoc.metering_plan_id,
    udoc.rating_plan_id, udoc.pricing_plan_id].join('/')];

const okeys = (udoc) =>
  [[udoc.organization_id, udoc.resource_instance_id,
    udoc.consumer_id || 'UNKNOWN', udoc.plan_id, udoc.metering_plan_id,
    udoc.rating_plan_id, udoc.pricing_plan_id].join('/')];

const otimes = (udoc, itime) =>
  [map([udoc.start, udoc.end], seqid.pad16).join('/')];

// The scaling factor of each time window for creating the date string
// [Second, Minute, Hour, Day, Month, Year, Forever]
const slack = /^[0-9]+[MDhms]$/.test(process.env.SLACK) ? {
  scale : process.env.SLACK.charAt(process.env.SLACK.length - 1),
  width : process.env.SLACK.match(/[0-9]+/)[0]
} : {};

// Time dimension keys corresponding to their respective window positions
const dimensions = ['s', 'm', 'h', 'D', 'M'];

// Return the configured price for the metrics that is attached in the
// usage document
const price = (pricings, metric) => 
  filter(pricings, (m) => m.name === metric)[0].price;

// Return the accumulate function for a given metric
const accumfn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].accumulatefn;
};

// Return the rate function for a given metric
const ratefn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].ratefn;
};

// Calculates the max number of time windows in a given time scale based on
// the slack's configuration
const maxSlack = (w) => {
  const slackscale = {
    M: { 4: 1 },
    D: { 4: 28, 3: 1 },
    h: { 4: 672, 3: 24, 2: 1 },
    m: { 4: 40320, 3: 1440, 2: 60, 1: 1 },
    s: { 4: 2419200, 3: 86400, 2: 3600, 1: 60, 0: 1 }
  };
  if(slack.scale && slackscale[slack.scale][w])
    return map(Array(Math.ceil(1 / slackscale[slack.scale][w] * slack.width)
      + 1), () => null);
  return [null];
};

// Return the accumulated usage windows for a given metric
const accum = (au, metric) => {
  const a = filter(au, (a) => a.metric === metric);
  return a.length ? a[0].windows : [maxSlack(0),
    maxSlack(1), maxSlack(2), maxSlack(3), maxSlack(4)];
};

// Accumulate usage and return new accumulated value
const accumulate = function *(a, u) {
  debug(
    'Accumulating usage %o from %d and new usage %o from %d',
    a, a ? a.end : 0, u, u.end);

  // Compute the accumulated usage time and new usage time
  const now = Date.now();
  const processed = a ? a.processed : 0;

  // Use previous accumulated value if any
  const umerge = omit(u, 'id', 'metrics', 'metered_usage', 'measured_usage');
  const amerge = a ? extend({}, a, omit(umerge, 'start')) : extend({
    accumulated_usage: []
  }, umerge);

  // Retrieve the metering plan
  const mplan = yield mconfig(
    u.metering_plan_id, systemToken && systemToken());

  // Retrieve the rating plan
  const rplan = yield rconfig(
    u.rating_plan_id, systemToken && systemToken());

  // Calculate new accumulated usage
  const newa = extend({}, amerge, {
    accumulated_usage: map(u.metered_usage, (mu) => {
      debug('Accumulating metered usage quantity %o', mu);

      // Find the rate function for the given metric
      const rfn = ratefn(rplan.metrics, mu.metric);

      // Find the price for the metric
      const rp = price(u.prices.metrics, mu.metric);

      const aw = accum(amerge.accumulated_usage, mu.metric);

      return {
        metric: mu.metric,
        windows: map(aw, (w, i) => {
          // Shift the windows if now is part of a new time window
          if(a && now > processed)
            timewindow.shiftWindow(new Date(a.processed),
              new Date(now), w, dimensions[i]);

          const twi = timewindow.timeWindowIndex(w, new Date(now),
            new Date(u.end), dimensions[i]);
          /* eslint complexity: [1, 6] */
          const quantities = map(w, (tw, j) => {
            if(twi === j) {
              if(tw && tw.quantity && tw.quantity.current) {
                debug('Accumulating window %d index %d' +
                  ' new quantity %o old quantity %o', i, twi, tw, mu);

                return {
                  quantity: {
                    previous: tw.quantity.current,
                    current: accumfn(mplan.metrics, mu.metric)
                      (tw.quantity.current, mu.quantity)
                  }
                };
              }
              debug('New window %d index %d new quantity %o', i, twi, tw);

              return {
                quantity: {
                  current: accumfn(mplan.metrics, mu.metric)(0, mu.quantity)
                }
              };
            }
            return tw ? extend({}, tw) : null;
          });

          // Calculate cost for all accumulated quantities
          return map(quantities, (q) => q ?
            extend(q, { cost: q.quantity.current ?
              rfn(rp, q.quantity.current) : 0 }) :
            null);
        })
      };
    })
  });

  debug('New accumulated usage %o', newa);
  return newa;
};

// Process a group of usage docs and compute the corresponding
// accumulated usage
const accumulateUsage = function *(accums, udocs) {
  const ologs = yield treduce(udocs, function *(log, udoc, i, l) {
    const res = yield accumulate(last(log)[0], udoc);
    return log.concat([[res]]);
  }, [[
    accums[0]
  ]]);
  return rest(ologs);
};

// Create an accumulator service app
const accumulator = () => {
  // Configure Node cluster to use a single process as we want to serialize
  // accumulation requests per db partition and app instance
  cluster.singleton();

  // Create the Webapp
  const app = webapp();

  // Secure metering and batch routes using an OAuth bearer access token
  if (secured())
    app.use(/^\/v1\/metering|^\/batch$/,
      oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  const reducer = dataflow.reducer(accumulateUsage, {
    input: {
      type: 'metered-usage',
      post: '/v1/metering/metered/usage',
      get: '/v1/metering/metered/usage' +
        '/t/:tseq/k/:korganization_id/:kresource_instance_id' +
        '/:kconsumer_id/:kplan_id',
      dbname: 'abacus-accumulator-metered-usage',
      wscope: iwscope,
      rscope: rscope,
      key: ikey,
      time: itime,
      groups: igroups
    },
    output: {
      type: 'accumulated_usage',
      get: '/v1/metering/accumulated/usage' +
        '/k/:korganization_id/:kresource_instance_id' +
        '/:kconsumer_id/:kplan_id' +
        '/t/:tend/:tstart',
      dbname: 'abacus-accumulator-accumulated-usage',
      rscope: rscope,
      keys: okeys,
      times: otimes
    },
    sink: {
      host: uris.aggregator,
      apps: process.env.AGGREGATOR_APPS,
      post: '/v1/metering/accumulated/usage',
      authentication: systemToken
    }
  });

  app.use(reducer);
  app.use(router.batch(app));

  app.reducer = reducer;
  return app;
};

// Command line interface, create the accumulator app and listen
const runCLI = () => {
  // Cache and schedule the system token renewal
  if (secured()) {
    systemToken = oauth.cache(uris.auth_server, process.env.CLIENT_ID,
      process.env.CLIENT_SECRET, 'abacus.usage.write abacus.usage.read');

    systemToken.start();
  }

  // Create the app, replay any failed events, and listen
  const app = accumulator();
  dataflow.replay(app.reducer, 0, () => {
    app.listen();
  });
};

// Export our public functions
module.exports = accumulator;
module.exports.runCLI = runCLI;
