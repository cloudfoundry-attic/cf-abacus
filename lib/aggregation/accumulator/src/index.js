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
const find = _.find;
const rest = _.rest;
const indexOf = _.indexOf;

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
    udoc.rating_plan_id, udoc.pricing_plan_id].join('/'),
    [udoc.organization_id, udoc.resource_instance_id,
    udoc.consumer_id || 'UNKNOWN', udoc.plan_id].join('/')];

const skeys = (udoc) =>
  [udoc.organization_id, undefined];

// Configure reduction result doc sampling, to store reduction results
// in a single doc per min, hour or day for example instead of creating
// a new doc for each new result
const sampling = parseInt(process.env.SAMPLING) || 1;

const otimes = (udoc, itime) =>
  [seqid.sample(itime, sampling),
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

// Millisecond representation of the time dimensions
const msDimensions = {
  M: 2678400000,
  D: 86400000,
  h: 3600000,
  m: 60000,
  s: 1000
};

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
  if(slack().scale && slackscale[slack().scale][w])
    return map(Array(Math.ceil(1 / slackscale[slack().scale][w] * slack().width)
      + 1), () => null);
  return [null];
};

// Return the accumulated usage windows for a given metric
const accum = (au, metric) => {
  const a = filter(au, (a) => a.metric === metric);
  return a.length ? a[0].windows : [maxSlack(0),
    maxSlack(1), maxSlack(2), maxSlack(3), maxSlack(4)];
};

// find info with error and reason to redirect 
// usage to error db and stop processing it to the next pipeline.
const findError = (info) => find(info, (i) => i.error);

// Accumulate usage and return new accumulated value
const accumulate = function *(accums, u) {
  debug(
    'Accumulating usage %o from %d and new usage %o from %d',
    accums[0], accums[0] ? accums[0].end : 0, u, u.end);

  // Accumulate new usage into the first of the set of output docs
  // produced at each reduction iteration
  const a = accums[0];

  // Even a millisecond difference could have the usage misplaced in the windows
  // Use time from processed_id
  const now = parseInt(u.processed_id);
  const slackLimit = msDimensions[slack().scale] * slack().width;
  if(u.end < now - slackLimit)
    throw extend(new Error('The usage submitted is older than ' + slackLimit +
      ' milliseconds'), {
        status: 409,
        error: 'conflict',
        reason: 'The usage submitted is older than ' + slackLimit +
          ' milliseconds',
        noretry: true,
        nobreaker: true
      });

  // Retrieve the metering plan and rating plan
  const [mplan, rplan] = yield [
    mconfig(u.metering_plan_id, systemToken && systemToken()),
    rconfig(u.rating_plan_id, systemToken && systemToken())
  ];

  const e = findError([mplan, rplan]);

  if(e) {
    debug('The usage submitted has business errors %o', e);
    return extend({}, u, e);
  }

  // Compute the accumulated usage time and new usage time
  const processed = a ? a.processed : 0;

  // Use previous accumulated value if any
  const umerge = omit(u, 'id', 'metrics', 'metered_usage', 'measured_usage');
  const amerge = a ? extend({}, a, omit(umerge, 'start')) : extend({
    accumulated_usage: []
  }, umerge);

  // Calculate new accumulated usage
  const newa = extend({}, amerge, {
    accumulated_usage: map(u.metered_usage, (mu) => {
      debug('Accumulating metered usage quantity %o', mu);

      // Find the rate function for the given metric
      const rfn = ratefn(rplan.rating_plan.metrics, mu.metric);

      // Find the price for the metric
      const rp = price(u.prices.metrics, mu.metric);

      const aw = accum(amerge.accumulated_usage, mu.metric);
  
      // a function that gives the value of the submitted usage in the
      // dimension window.
      const getCell = timewindow.cellfn(aw, now, u.end);

      return {
        metric: mu.metric,
        windows: map(aw, (w, i) => {
          // Get the appropriate time window index
          const twi = timewindow.timeWindowIndex(w, new Date(now),
            new Date(u.end), dimensions[i], true);

          // Expand the timewindows if necessary
          if(i >= indexOf(dimensions, slack().scale) && w.length - 1 < twi)
            map(Array(twi - w.length + 1), () => w.push(null));

          // Shift the windows if now is part of a new time window
          if(a && now > processed)
            timewindow.shiftWindow(new Date(a.processed),
              new Date(now), w, dimensions[i]);

          /* eslint complexity: [1, 6] */
          const quantities = map(w, (tw, j) => {
            const bounds = timewindow.timeWindowBounds(new Date(now),
              dimensions[i], -j);
            const current = tw && tw.quantity && tw.quantity.current ?
              tw.quantity.current : 0;
            const accumulated = accumfn(mplan.metering_plan.metrics, mu.metric)
              (current, mu.quantity, u.start, u.end, bounds.from, bounds.to,
                getCell);

            // Do not accumulate if the function returns null
            if(accumulated === null) {
              debug('No accumulation in window %d index %d', i, j);
              return tw ? extend({}, tw) : null;
            }

            // Switch old current to previous in previously accumulated windows
            if(tw && tw.quantity && tw.quantity.current) {
              debug('Accumulating window %d index %d' +
                ' new quantity %o old quantity %o', i, j, tw, mu);
              return {
                quantity: {
                  previous: tw.quantity.current,
                  current: accumulated
                }
              };
            }

            // Create a new accumulated object at the window
            debug('New window %d index %d new quantity %o', i, j, tw);
            return {
              quantity: {
                current: accumulated
              }
            };
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

  // Return new accumulated usage and an empty doc used for duplicate
  // usage detection
  debug('New accumulated usage %o', newa);
  return [newa, {}];
};

// Process a group of usage docs and compute the corresponding
// accumulated usage
const accumulateUsage = function *(accums, udocs) {
  const ologs = yield treduce(udocs, function *(log, udoc, i, l) {
    const res = yield accumulate(last(log), udoc);
    return log.concat([res]);
  }, [
    accums
  ]);
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
      type: 'metered_usage',
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
      posts: ['/v1/metering/accumulated/usage', undefined],
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
