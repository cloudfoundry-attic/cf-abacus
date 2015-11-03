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
const lockcb = require('abacus-lock');
const lru = require('lru-cache');

const filter = _.filter;
const map = _.map;
const extend = _.extend;
const omit = _.omit;

const brequest = yieldable(retry(breaker(batch(request))));

const lock = yieldable(lockcb);

const tmap = yieldable(transform.map);
const treduce = yieldable(transform.reduce);

const config = yieldable(configcb);
const prices = yieldable(pricescb);

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-rating');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// OAuth bearer access token with Abacus system access scopes
let systemToken;

/* eslint camelcase: 1 */

// Resolve service URIs
const uris = urienv({
  auth_server: 9882,
  account: 9881
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

const okeys = (udoc, ikey) => 
  [udoc.organization_id];

const otimes = (udoc, itime) => 
  [itime];

// Maintain a cache of pricing countries
const countries = lru({
  max: 100000,
  length: (n) => 1,
  dispose: (key, n) => {
  },
  maxAge: 1000 * 3600 * 6
});

// Return the pricing country configured for an organization's account
// using batch and group by organization
const pricingCountry = yieldable(batch(batch.groupBy(function *(calls) {
  // Get pricing country for each organization and collect the results
  const gres = yield tmap(calls, function *(call) {
    const oid = calls[0][0];
    const unlock = yield lock(oid);
    try {
      debug('Retrieving pricing country for org %s', oid);

      // Look in our cache first
      const cc = countries.get(oid);
      if(cc) return [undefined, cc];

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
      return [undefined, c];
    }
    finally {
      unlock();
    }
  });

  // Return the group results
  return gres;
}, function *(call) {
  // group by organization - first argument
  return call[0];
})));

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

// Return the rate function for a given metric
const ratefn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].ratefn;
};

// Rates the given aggregated usage
const rateUsage = function *(u, auth) {
  debug('Rating usage %o from %d', u, u.end);

  // Retrieve the pricing country configured for the org's account
  const country = yield pricingCountry(u.organization_id);
  debug('Pricing country %o', country);

  // Retrieve all resources' metrics and price
  const resourceConfigs = yield treduce(u.resources, function *(a, r) {
    a[r.resource_id] = {
      rconf: yield config(
        r.resource_id, u.end, systemToken && systemToken()),
      pconf: yield prices(
        r.resource_id, u.end, systemToken && systemToken())
    };
    return a;
  }, {});

  // Rate the aggregated usage under a resource
  const rateResource = function(rs) {
    const rconf = resourceConfigs[rs.resource_id].rconf;
    const pconf = resourceConfigs[rs.resource_id].pconf;

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
      plans: map(rs.plans, (p) => {
        return extend({}, p, {
          aggregated_usage: map(p.aggregated_usage, (m) => {

            // Find the rate function configured for each metric
            const rfn = ratefn(rconf.metrics, m.metric);

            // Find the price configured for each metric
            const rp = price(pconf, p.plan_id, m.metric, country);

            // Return the metric along with the calculated cost
            return extend({}, omit(m, 'quantity'), {
              windows: map(m.quantity, (w) => {
                return map(w, (q) => ({
                  quantity: q,
                  cost: q ? rfn(rp, q) : 0
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
    resources: map(u.resources, rateResource),
    spaces: map(u.spaces, (space) => {
      return extend({}, space, {
        resources: map(space.resources, rateResource),
        consumers: map(space.consumers, (consumer) => {
          return extend({}, consumer, {
            resources: map(consumer.resources, rateResource)
          });
        })
      });
    })
  });

  debug('New rated usage %o', ru);
  return [ru];
};

// Create a rating service app
const rating = () => {
  // Configure Node cluster to use a single process as we want to serialize
  // rating requests per db partition and app instance
  cluster.singleton();

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
      get: '/v1/rating/aggregated/usage/t/:tseq/k/:korganization_id',
      dbname: 'abacus-rating-aggregated-usage',
      wscope: iwscope,
      rscope: rscope,
      key: ikey,
      time: itime
    },
    output: {
      type: 'rated_usage',
      get: '/v1/rating/rated/usage/k/:korganization_id/t/:tseq',
      dbname: 'abacus-rating-rated-usage',
      rscope: rscope,
      keys: okeys,
      times: otimes
    },
    sink: {
    }
  });

  app.use(mapper);
  app.use(router.batch(app));

  app.mapper = mapper;
  return app;
};

// Command line interface, create the rate app and listen
const runCLI = () => {
  // Cache and schedule the system token renewal
  if (secured()) {
    systemToken = oauth.cache(uris.auth_server, process.env.CLIENT_ID,
      process.env.CLIENT_SECRET, 'abacus.usage.write abacus.usage.read');

    systemToken.start();
  }

  // Create the app, replay any failed events, and listen
  const app = rating();
  dataflow.replay(app.mapper, 0, () => {
    app.listen();
  });
};

// Export public methods
module.exports = rating;
module.exports.runCLI = runCLI;
