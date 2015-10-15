'use strict';

// Usage rating service

const _ = require('underscore');
const webapp = require('abacus-webapp');
const cluster = require('abacus-cluster');
const router = require('abacus-router');
const request = require('abacus-request');
const batch = require('abacus-batch');
const yieldable = require('abacus-yieldable');
const breaker = require('abacus-breaker');
const retry = require('abacus-retry');
const urienv = require('abacus-urienv');
const seqid = require('abacus-seqid');
const oauth = require('abacus-cfoauth');
const configcb = require('abacus-resource-config');
const pricescb = require('abacus-price-config');
const transform = require('abacus-transform');
const dataflow = require('abacus-dataflow');

const filter = _.filter;
const map = _.map;
const extend = _.extend;
const omit = _.omit;

const brequest = yieldable(retry(breaker(batch(request))));

const tmap = yieldable(transform.map);

const config = yieldable(configcb);
const prices = yieldable(pricescb);

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-rating');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

/* eslint camelcase: 1 */

// Resolve service URIs
const uris = urienv({
  couchdb: 5984,
  account: 9381
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
  udoc.organization_id].join('/')

const itime = (udoc) => [
  udoc.end,
  seqid()].join('/');

const okey = (udoc) => [
  udoc.organization_id].join('/')

const otime = (udoc) => [
  udoc.end,
  seqid()].join('/');

// Return the pricing country configured for an organization's account
const pricingCountry = function *(oid, auth) {
  // Forward authorization header field to account
  const o = auth ? { headers: { authorization: auth } } : {};

  const account = yield brequest.get(
    uris.account + '/v1/orgs/:org_id/account', extend(o, {
      org_id: oid
    }));

  // Default to USA
  return !account.body || !account.body.pricing_country ?
    'USA' : account.body.pricing_country;
};

// Return the configured price for the given resource, plan, metric, and
// country
const price = function *(rid, pid, metric, country, time, auth) {
  // Retrieve the resource price config
  const resource = yield prices(rid, time, auth);
  if(resource) {
    // Find the specified plan
    const plan = filter(resource.plans, (p) => p.plan_id === pid);
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

// Return the rate function for a given metric
const ratefn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].ratefn;
};

// Rates the given aggregated usage
const rateUsage = function *(u, auth) {
  debug('Rating usage %o from %d', u, u.end);

  // Retrieve the pricing country configured for the org's account
  const pc = yield pricingCountry(u.organization_id, auth);
  debug('Pricing country %o', pc);

  // Rate the aggregated usage under a resource
  const rateResource = function *(rs) {

    // Find the metrics configured for the given resource
    const conf = yield config(rs.resource_id, u.end, auth);

    // Compute the cost of each metric under the resource plans
    return extend({}, rs, {
      aggregated_usage: map(rs.aggregated_usage, (au) => {
        return extend({}, omit(au, 'quantity'), {
          windows: map(au.quantity, (w) => {
            return map(w, (q) => ({
              quantity: q
            }));
          })
        });
      }),
      plans: yield tmap(rs.plans, function *(p) {
        return extend({}, p, {
          aggregated_usage: yield tmap(p.aggregated_usage, function *(m) {

            // Find the rate function configured for each metric
            const rfn = ratefn(conf.metrics, m.metric);

            // Return the metric along with the calculated cost
            const rp = yield price(
              rs.resource_id, p.plan_id, m.metric, pc, u.end, auth);
            return extend({}, omit(m, 'quantity'), {
              windows: map(m.quantity, (w) => {
                return map(w, (q) => ({
                  quantity: q,
                  cost: rfn(rp, q)
                }));
              })
            });
          })
        });
      })
    });
  };

  // Extend the aggregated usage with the computed costs
  const ru = extend({}, u, {
    resources: yield tmap(u.resources, rateResource),
    spaces: yield tmap(u.spaces, function *(space) {
      return extend({}, space, {
        resources: yield tmap(space.resources, rateResource),
        consumers: yield tmap(space.consumers, function *(consumer) {
          return extend({}, consumer, {
            resources: yield tmap(consumer.resources, rateResource)
          });
        })
      });
    })
  });

  debug('New rated usage %o', ru);
  return [ru];
};

// Perform recovery logic when the application starts
const recover = () => {
  // Process any unprocessed docs from our input db

  // TODO insert our recovery logic here
};

// Create a rate app
const rateapp = () => {
  // Configure Node cluster to use a single process as we want to serialize
  // rating requests per db partition and app instance
  cluster.singleton();

  // Perform recovery if necessary
  recover();

  // Create the Webapp
  const app = webapp();

  // Secure rating and batch routes using an OAuth bearer access token
  if (secured())
    app.use(/^\/v1\/rating|^\/batch$/,
      oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  const mapper = dataflow.mapper(rateUsage, {
    input: {
      type: 'aggregated_usage',
      post: '/v1/rating/aggregated/usage',
      get: '/v1/rating/aggregated/usage/k/:korganization_id' +
        '/t/:tend/:tseq',
      dbname: 'abacus-rating-aggregated-usage',
      wscope: iwscope,
      rscope: rscope,
      key: ikey,
      time: itime
    },
    output: {
      type: 'rated_usage',
      get: '/v1/rating/rated/usage/k/:korganization_id' +
        '/t/:tend/:tseq',
      dbname: 'abacus-rating-rated-usage',
      rscope: rscope,
      key: okey,
      time: otime
    },
    sink: {
    }
  });

  app.use(mapper);
  app.use(router.batch(app));
  return app;
};

// Command line interface, create the rate app and listen
const runCLI = () => rateapp().listen();

// Export public methods
module.exports = rateapp;
module.exports.runCLI = runCLI;
