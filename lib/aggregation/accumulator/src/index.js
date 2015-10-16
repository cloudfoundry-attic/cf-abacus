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

// Return the accumulated usage for a given metric
const accum = (au, metric) => {
  const a = filter(au, (a) => a.metric === metric);
  return a.length ? a[0].quantity : [[0], [0], [0], [0], [0]];
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
  const newend = dateUTCNumbify(u.end);
  const oldend = a ? dateUTCNumbify(a.end) : 0;

  // Retrieve the configured metrics for the resource
  const conf = yield config(u.resource_id, u.end, systemToken && systemToken());

  // Calculate new accumulated usage
  const newa = extend({}, amerge, {
    accumulated_usage: map(u.metered_usage, (mu) => {
      debug('Accumulating metered usage quantity %o', mu);
      const aq = accum(amerge.accumulated_usage, mu.metric);

      return {
        metric: mu.metric,
        quantity: map(aq, (w, i) => {
          const timediff = Math.floor(newend / timescale[i])
            - Math.floor(oldend / timescale[i]);
          return map(w, (q) => {
            // If there is no previous quantity for the current window
            // or the window has changed, start with a new current
            // quantity and an undefined previous quantity
            if(!q || timediff >= 1) {
              debug('Resetting window %d timediff %d new quantity %o',
                i, timediff, q);
              return {
                current: accumfn(conf.metrics, mu.metric)(0, mu.quantity)
              };
            }

            // Accumulate the new usage into the already accumulated usage
            // in the case of an already existing accumulated quantity
            // in the current time window
            debug(
              'Accumulating window %d timediff %d' +
              ' old quantity %o new quantity %o', i, timediff, q, mu);
            return {
              previous: q.current,
              current: accumfn(conf.metrics, mu.metric)(q.current, mu.quantity)
            };
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

  accumulator().listen();
};

// Export our public functions
module.exports = accumulator;
module.exports.runCLI = runCLI;
