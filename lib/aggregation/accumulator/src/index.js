'use strict';

// Usage accumulator service.

const _ = require('underscore');
const webapp = require('abacus-webapp');
const cluster = require('abacus-cluster');
const router = require('abacus-router');
const batch = require('abacus-batch');
const request = require('abacus-request');
const yieldable = require('abacus-yieldable');
const breaker = require('abacus-breaker');
const retry = require('abacus-retry');
const urienv = require('abacus-urienv');
const oauth = require('abacus-cfoauth');
const configcb = require('abacus-resource-config');
const pricescb = require('abacus-price-config');
const transform = require('abacus-transform');
const dataflow = require('abacus-dataflow');
const seqid = require('abacus-seqid');
const lru = require('abacus-lrucache');

const map = _.map;
const last = _.last;
const extend = _.extend;
const omit = _.omit;
const filter = _.filter;
const rest = _.rest;

const brequest = yieldable(retry(breaker(batch(request))));

const treduce = yieldable(transform.reduce);

const config = yieldable(configcb);
const prices = yieldable(pricescb);

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
  account: 9881,
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

const igroup = (udoc) =>
  [udoc.organization_id, udoc.resource_instance_id,
    udoc.consumer_id || 'UNKNOWN', udoc.plan_id].join('/');

const itime = (udoc) =>
  seqid();

const okeys = (udoc) =>
  [[udoc.organization_id, udoc.resource_instance_id,
    udoc.consumer_id || 'UNKNOWN', udoc.plan_id].join('/')];

const otimes = (udoc, itime) =>
  [map([udoc.start, udoc.end], seqid.pad16).join('/')];

// The scaling factor of each time window for creating the date string
// [Second, Minute, Hour, Day, Month, Year, Forever]
const slack = /^[0-9]+[MDhms]$/.test(process.env.SLACK) ? {
  scale : process.env.SLACK.charAt(process.env.SLACK.length - 1),
  width : process.env.SLACK.match(/[0-9]+/)[0]
} : {};

const timescale = [1, 100, 10000, 1000000, 100000000];

// Converts a millisecond number to a format a number that is YYYYMMDDHHmmSS
const dateUTCNumbify = (t) => {
  const d = new Date(t);
  return d.getUTCFullYear() * 10000000000 + d.getUTCMonth() * timescale[4]
    + d.getUTCDate() * timescale[3] + d.getUTCHours() * timescale[2]
    + d.getUTCMinutes() * timescale[1] + d.getUTCSeconds();
};

// Maintain a cache of pricing countries
const countries = lru({
  max: 10000,
  maxAge: 1000 * 3600 * 6
});

// Return the pricing country configured for an organization's account
// using batch and group by organization
const pricingCountry = function *(oid) {
  // Get pricing country for a given organization
  debug('Retrieving pricing country for org %s', oid);

  // Look in our cache first
  const cc = countries.get(oid);
  if(cc) return cc;

  // Forward authorization header field to account
  const o = systemToken ?
    { headers: { authorization: systemToken() } } : {};
  const account = yield brequest.get(
    uris.account + '/v1/orgs/:org_id/account', extend(o, {
      org_id: oid
    }));

  // Default to USA
  const c = !account.body || !account.body.pricing_country ?
    'USA' : account.body.pricing_country;

  // Cache and return
  countries.set(oid, c);
  return c;
};

// Return the configured price for the given plan, metric, and country
const price = (pconf, pid, metric, country) => {
  if(pconf) {
    // Find the specified plan
    const plan = filter(pconf.plans, (p) => p.plan_id === pid);
    if(plan.length) {
      // Find the specified metric price
      const metrics = filter(plan[0].metrics, (m) => m.name === metric);

      // Use the configured price for the specified country, default to 0
      const cp = filter(metrics[0].prices, (p) => p.country === country);
      return cp.length ? cp[0].price : 0;
    }
  }
  return 0;
};

// Return the accumulate function for a given metric
const accumfn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].accumulatefn;
};

// Return the rate function for a given metric
const ratefn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].ratefn;
};

// Calculates the max number of slack windows in a given time window
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

// Returns the index to the slack window that the usage will be accumulated to
// Returns a -1 if the usage is too old to fall within the slack window
const slackIndex = (e, n, ts, tsi) => {
  const end = dateUTCNumbify(e);
  const now = dateUTCNumbify(n);
  // The difference scaled to the window between the processed and end time
  // This is at least 0 to push future usage into the current window
  const diff = Math.max(Math.floor(now / ts) - Math.floor(end / ts), 0);
  if(slack.scale) {
    const slackStart = {
      M: (d) => d.setUTCMonth(d.getUTCMonth() - slack.width),
      D: (d) => d.setUTCDate(d.getUTCDate() - slack.width),
      h: (d) => d.setUTCHours(d.getUTCHours() - slack.width),
      m: (d) => d.setUTCMinutes(d.getUTCMinutes() - slack.width),
      s: (d) => d.setUTCSeconds(d.getUTCSeconds() - slack.width)
    };
    const start = dateUTCNumbify(slackStart[slack.scale](new Date(n)));

    if(Math.floor(end / ts) - Math.floor(start / ts) < 0 ||
      maxSlack(tsi).length <= diff)
      return -1;
  }
  return diff;
};

// Return the accumulated usage windows for a given metric
const accum = (au, metric) => {
  const a = filter(au, (a) => a.metric === metric);
  return a.length ? a[0].windows : [maxSlack(0),
    maxSlack(1), maxSlack(2), maxSlack(3), maxSlack(4)];
};

// Shifts w in the timescale of i by the difference in time between n and o
const shift = (o, n, w, i) => {
  if(w.length <= 1)
    return;
  // Zero out any smaller timescales than the current one
  const od = new Date(Date.UTC.apply(null, [
    o.getUTCFullYear(), o.getUTCMonth(), o.getUTCDate(), o.getUTCMinutes(),
    o.getUTCSeconds()].slice(0, 6 - i)));
  const nd = Date.UTC.apply(null, [
    n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), n.getUTCMinutes(),
    n.getUTCSeconds()].slice(0, 6 - i));

  // Based upon the time scale, the modification function is chosen
  const increment = {
    0: (d) => d.setUTCSecond(d.getUTCSecond() + 1),
    1: (d) => d.setUTCMinutes(d.getUTCMinutes() + 1),
    2: (d) => d.setUTCHour(d.getUTCHour() + 1),
    3: (d) => d.setUTCDate(d.getUTCDate() + 1),
    4: (d) => d.setUTCMonth(d.getUTCMonth() + 1)
  };

  // Count from od to nd the number of positions that need to be shifted
  let shifts = 0;
  map(Array(w.length), () => {
    if(od.getTime() < nd) {
      shifts++;
      increment[i](od);
    }
  });

  // Shift by the number of positions counted
  map(Array(shifts), () => {
    w.unshift(null);
    w.pop();
  });
};

// Accumulate usage and return new accumulated value
const accumulate = function *(a, u) {
  debug(
    'Accumulating usage %o from %d and new usage %o from %d',
    a, a ? a.end : 0, u, u.end);

  // Use previous accumulated value if any
  const umerge = omit(u, 'id', 'metrics', 'metered_usage', 'measured_usage');
  const amerge = a ? extend({}, a, omit(umerge, 'start')) : extend({
    accumulated_usage: []
  }, umerge);

  // Compute the accumulated usage time and new usage time
  const n = Date.now();
  const now = dateUTCNumbify(n);
  const processed = a ? dateUTCNumbify(a.processed) : 0;

  // Retrieve the pricing country for the org's account
  const country = yield pricingCountry(u.organization_id);
  debug('Pricing country %o', country);

  // Retrieve the configured metrics for the resource
  const rconf = yield config(u.resource_id, u.end,
    systemToken && systemToken());

  // Retrieve the configured price for the resource
  const pconf = yield prices(u.resource_id, u.end,
    systemToken && systemToken());

  // Calculate new accumulated usage
  const newa = extend({}, amerge, {
    accumulated_usage: map(u.metered_usage, (mu) => {
      debug('Accumulating metered usage quantity %o', mu);

      // Find the rate function for the given metric
      const rfn = ratefn(rconf.metrics, mu.metric);

      // Find the price for the given plan, metric and country
      const rp = price(pconf, u.plan_id, mu.metric, country);

      const aw = accum(amerge.accumulated_usage, mu.metric);

      return {
        metric: mu.metric,
        windows: map(aw, (w, i) => {
          // Get the time difference between now and the last processed time
          const timediff = Math.floor(now / timescale[i])
            - Math.floor(processed / timescale[i]);
          // Shift the windows if now is part of a new time window
          if(a && timediff > 0)
            shift(new Date(a.processed), new Date(n), w, i);

          const si = slackIndex(new Date(u.end), new Date(n), timescale[i], i);
          const quantities = map(w, (wh, j) => {
            if(si === j) {
              if(wh && wh.quantity && wh.quantity.current) {
                debug('Accumulating window %d index %d timediff %d' +
                  ' new quantity %o old quantity %o', i, si, timediff, wh, mu);

                return {
                  quantity: {
                    previous: wh.quantity.current,
                    current: accumfn(rconf.metrics, mu.metric)
                      (wh.quantity.current, mu.quantity)
                  }
                };
              }
              debug('New window %d index %d timediff %d new quantity %o',
                i, si, timediff, wh);

              return {
                quantity: {
                  current: accumfn(rconf.metrics, mu.metric)(0, mu.quantity)
                }
              };
            }
            return wh ? extend({}, wh) : null;
          });

          // Calculate cost for all accumulated quantities
          return map(quantities, (q) => q ?
            extend(q, { cost: q.quantity.current ?
              rfn(rp, q.quantity.current) : null }) :
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
const accumulateUsage = function *(accum, udocs) {
  const ologs = yield treduce(udocs, function *(log, udoc, i, l) {
    const res = yield accumulate(last(log)[0], udoc);
    return log.concat([[res]]);
  }, [[
    accum
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
      group: igroup,
      time: itime
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
