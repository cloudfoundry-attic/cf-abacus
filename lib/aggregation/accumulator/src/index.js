'use strict';

// Usage accumulator service.

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

const map = _.map;
const last = _.last;
const extend = _.extend;
const omit = _.omit;
const filter = _.filter;
const rest = _.rest;

const treduce = yieldable(transform.reduce);

const config = yieldable(configcb);

/* eslint camelcase: 1 */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-accumulator');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// OAuth bearer access token with Abacus system access scopes
let systemToken;
const slack = /^[0-9]+[MDhms]$/.test(process.env.SLACK) ? {
  scale : process.env.SLACK.charAt(process.env.SLACK.length - 1),
  width : process.env.SLACK.match(/[0-9]+/)[0]
} : {};

// Resolve service URIs
const uris = urienv({
  couchdb: 5984,
  aggregator: 9200
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
const ikey = (udoc) => [
  udoc.organization_id,
  udoc.resource_instance_id,
  udoc.plan_id].join('/')

const itime = (udoc) =>
  seqid();

const utime = (udoc) => [
  udoc.start,
  udoc.end].join('/');

const okey = (udoc) => [
  udoc.organization_id,
  udoc.resource_instance_id,
  udoc.plan_id].join('/')

const ogroup = (udoc) => [
  udoc.organization_id,
  udoc.resource_instance_id,
  udoc.plan_id].join('/')

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

// Return the accumulate function for a given metric
const accumfn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].accumulatefn;
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
      + 1), () => 0);
  return [0];
};

// Returns the index to the slack window that the usage will be accumulated to
// Returns a -1 if the usage is too old to fall within the slack window
const slackIndex = (e, n, ts, tsi) => {
  const end = dateUTCNumbify(e);
  const now = dateUTCNumbify(n);
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
      maxSlack(tsi).length <= 1)
      return -1;
  }
  return Math.floor(now / ts) - Math.floor(end / ts);
};

// Return the accumulated usage for a given metric
const accum = (au, metric) => {
  const a = filter(au, (a) => a.metric === metric);
  return a.length ? a[0].quantity : [maxSlack(0),
    maxSlack(1), maxSlack(2), maxSlack(3), maxSlack(4)];
};

// Accumulate usage and return new accumulated value
const accumulate = function *(a, u, auth) {
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

  // Retrieve the configured metrics for the resource
  const conf = yield config(u.resource_id, u.end,
    systemToken && systemToken());

  // Calculate new accumulated usage
  const newa = extend({}, amerge, {
    accumulated_usage: map(u.metered_usage, (mu) => {
      debug('Accumulating metered usage quantity %o', mu);
      const aq = accum(amerge.accumulated_usage, mu.metric);

      return {
        metric: mu.metric,
        quantity: map(aq, (q, i) => {
          // Get the time difference between now and the last processed time
          const timediff = Math.floor(now / timescale[i])
            - Math.floor(processed / timescale[i]);
          // Shift the windows if now is part of a new time window
          if(a && timediff > 0) {
            const max = maxSlack(i).length;
            map(Array(Math.min(timediff, max)), () => {
              q.unshift(0);
              q.pop();
            });
          }

          const si = slackIndex(new Date(n), new Date(u.end), timescale[i], i);
          return map(q, (qh, j) => {
            if(si === j) {
              if(qh.current) {
                debug('Accumulating window %d index %d timediff %d' +
                  ' new quantity '
                  + '%o old quantity %o', i, si, timediff, qh, mu);
                return {
                  previous: qh.current,
                  current: accumfn(conf.metrics, mu.metric)
                    (qh.current, mu.quantity)
                };
              }
              debug('New window %d index %d timediff %d new quantity %o',
                i, si, timediff, qh);
              return {
                current: accumfn(conf.metrics, mu.metric)(0, mu.quantity)
              }
            }
            return 0;
          });
        })
      };
    })
  });

  debug('New accumulated usage %o', newa);
  return newa;
};

// Process a group of usage docs and compute the corresponding
// accumulated usage
const accumulateUsage = function *(accum, udocs, auth) {
  const ologs = yield treduce(udocs, function *(log, udoc, i, l) {
    const res = yield accumulate(last(log)[0], udoc, auth);
    return log.concat([[res]]);

  }, [[
    accum
  ]]);
  return rest(ologs);
};

// Create an accumulator app
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
      get: '/v1/metering/metered/usage/k/:korganization_id' +
        '/:kresource_instance_id/:kplan_id/t/:tseq',
      dbname: 'abacus-accumulator-metered-usage',
      wscope: iwscope,
      rscope: rscope,
      key: ikey,
      time: itime,
      utime: utime
    },
    output: {
      type: 'accumulated_usage',
      get: '/v1/metering/accumulated/usage/k/:korganization_id' +
        '/:kresource_instance_id/:kplan_id/t/:tseq',
      dbname: 'abacus-accumulator-accumulated-usage',
      rscope: rscope,
      key: okey,
      time: otime,
      group: ogroup
    },
    sink : {
      host: uris.aggregator,
      port: 9200,
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
    systemToken = oauth.cache(process.env.AUTHSERVER, process.env.CLIENTID,
      process.env.CLIENTSECRET, 'abacus.usage.write abacus.usage.read');

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
