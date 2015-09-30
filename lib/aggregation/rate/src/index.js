'use strict';

// Usage rating service

const _ = require('underscore');
const yieldable = require('abacus-yieldable');
const batch = require('abacus-batch');
const throttle = require('abacus-throttle');
const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const dbclient = require('abacus-dbclient');
const urienv = require('abacus-urienv');
const webapp = require('abacus-webapp');
const cluster = require('abacus-cluster');
const router = require('abacus-router');
const request = require('abacus-request');
const seqid = require('abacus-seqid');
const lockcb = require('abacus-lock');
const config = require('abacus-resource-config');
const prices = require('abacus-price-config');
const db = require('abacus-aggregation-db');

const filter = _.filter;
const map = _.map;
const last = _.last;
const extend = _.extend;
const omit = _.omit;

const brequest = yieldable(retry(breaker(batch(request))));

const lock = yieldable(lockcb);

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-rate');

// Resolve service URIs
const uris = urienv({
  couchdb: 5984,
  account: 9381
});

// Configure rated usage db
const ratedb = yieldable(retry(breaker(batch(
  db.logdb(uris.couchdb, 'abacus-rated-usage')))));
const logdb = yieldable(retry(breaker(batch(
  db.logdb(uris.couchdb, 'abacus-rated-usage-log')))));

// Configure the rated usage cache
const ratecache = yieldable(db.cache('abacus-rated-usage'));

// Return a doc location given a route template and params
const loc = (req, template, params) => req.protocol + '://' +
  req.headers.host + request.route(template, params);

// Return the rating start time for a given time
const day = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// Return the pricing country configured for an organization's account
const pricingCountry = function *(oid) {
  const account = yield brequest.get(
    uris.account + '/v1/orgs/:org_id/account', {
      org_id: oid
    });

  // Default to USA
  return !account.body || !account.body.pricing_country ?
    'USA' : account.body.pricing_country;
};

// Return the configured price for the given resource, plan, metric, and
// country
const price = (rid, pid, metric, country) => {
  // Retrieve the resource price config
  const resource = prices(rid);
  if(resource) {
    // Find the specified plan
    const plan = filter(resource.plans, (p) => p.plan_id === pid);
    if(plan.length) {
      // Find the specified metric price
      const metrics = filter(plan[0].metrics, (m) => m.name === metric);

      // Use the configured price for the specified country, default to 0
      const prices = filter(metrics[0].prices, (p) => p.country === country);
      return prices.length ? prices[0].price : 0;
    }
  }
  return 0;
};

// Return the rate function for a given metric
const ratefn = (metrics, metric) => {
  return filter(metrics, (m) => m.name === metric)[0].ratefn;
};

// Rates the given aggregated usage
const rate = (r, u, pc) => {
  // Rate the aggregated usage under a resource
  const rateResource = (rs) => {

    // Find the metrics configured for the given resource
    const metrics = config(rs.resource_id).metrics;

    // Compute the cost of each metric under the resource plans
    return extend({}, rs, {
      aggregated_usage: map(rs.aggregated_usage, (au) => {
        return extend({}, au, { quantity: au.quantity[6] });
      }),
      plans: map(rs.plans, (p) => {
        return extend({}, p, {
          aggregated_usage: map(p.aggregated_usage, (m) => {

            // Find the rate function configured for each metric
            const rfn = ratefn(metrics, m.metric);

            // Return the metric along with the calculated cost
            return extend({}, m, {
              cost: rfn(price(
                rs.resource_id, p.plan_id, m.metric, pc), m.quantity[6]),
              quantity: m.quantity[6]
            });
          })
        });
      })
    });
  };

  // Clone the aggregated usage and extend if with the computed costs
  const newr = extend({}, r, {
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

  debug('New rated usage %o', newr);
  return newr;
};

// Retrieved the rated usage
const ratedUsage = function *(id) {
  debug('Retrieving rated usage for %s', id);
  const doc = (yield ratecache.get(id)) || (yield ratedb.get(id));
  if(doc)
    debug('Found rated usage %o in %s', doc, doc.dbrev ? 'cache' : 'db');
  else
    debug('No existing rated usage');
  return doc;
};

// Log the rated usage
const logRatedUsage = function *(rlogdoc) {
  debug('Logging rated usage %s', rlogdoc.id);
  yield logdb.put(rlogdoc);

  debug('Logged rated usage %o', rlogdoc);
  return rlogdoc;
};

// Store the rated usage
const storeRatedUsage = function *(r, rid, rlogid, uid) {
  debug('Updating rated usage %s', rid);
  const rdoc = extend({}, omit(r, 'dbrev'), {
    id: rid,
    last_rated_usage_id: rlogid,
    aggregated_usage_id: uid
  });

  // Store the rated usage in the db
  const rrev = yield ratedb.put(
    extend({}, rdoc, r.dbrev ? { _rev: r.dbrev } : {}));

  // Store it in the cache as well with the rev we got from the db
  yield ratecache.put(
    extend({}, rdoc, { dbrev: rrev.rev }));

  debug('Updated rated usage %o', rdoc);
  return rid;
};

// Get rated usage, update and store it
const updateRatedUsage =
  yieldable(batch(batch.groupBy(function *(calls) {
    const rid = calls[0][0].rid;
    debug('Update rated usage for a group of %d usage docs with id %s',
      calls.length, rid);

    // Lock based on the given org and time period
    const unlock = yield lock(rid);
    try {
      // Retrieve the old rated usage for the given org and time
      const r = yield ratedUsage(rid);

      // Initialize the new rated usage
      // Remove last_rated_usage_id to avoid writing this property to
      // rated usage log
      let newr = r ? omit(r, 'last_rated_usage_id') : {
        organization_id: calls[0][0].u.organization_id,
        start: calls[0][0].u.start,
        end: calls[0][0].u.end
      };

      // Retrieve the pricing country configured for the org's account
      const pc = yield pricingCountry(calls[0][0].u.organization_id);

      // Rate the usage docs
      const rres = map(calls, (call) => {
        newr = rate(newr, call[0].u, pc);
        return [undefined, omit(newr, 'dbrev')];
      });

      // Store the final new rated usage
      const lcall = last(calls);
      yield storeRatedUsage(newr, rid, lcall[0].rlogid, lcall[0].uid);

      return rres;
    }
    finally {
      unlock();
    }
  }, function *(args) {
    // Group calls by rated usage id
    return args[0].rid;
  })));

// Rate the given aggregated usage
const rateUsage = function *(u) {
  // Compute the rated usage id and the rated usage log id
  const rid = dbclient.kturi(u.organization_id, day(u.end));
  const rlogid = dbclient.kturi(u.organization_id, [
    day(u.end), seqid()].join('/'));

  // Rate the usage
  const newr = yield updateRatedUsage({
    u: u, rid: rid, rlogid: rlogid, uid: u.id });

  // Log the rated usage
  const rlogdoc = extend(dbclient.undbify(newr), {
    id: rlogid,
    aggregated_usage_id: u.id
  });
  yield logRatedUsage(rlogdoc);

  return rlogid;
};

// Create an express router
const routes = router();

// Rate a given aggregated usage
routes.post('/v1/rating/usage', throttle(function *(req) {
  debug('Received usage to be rated %o', req.body);

  // Validate the input
  if(!req.body) return {
    statusCode: 400
  };
  const u = req.body;

  // Rate the usage
  const id = yield rateUsage(u);

  return {
    statusCode: 201,
    header: {
      Location: loc(req, '/v1/rating/rated/usage/:id', {
        id: id
      })
    }
  };
}));

// Retrieve the rated usage associated with the given id
routes.get(
  '/v1/rating/rated/usage/k/:organization_id/t/:day/:seq',
   throttle(function *(req) {
     const id = dbclient.kturi(req.params.organization_id,
      [req.params.day, req.params.seq].join('/'));
     debug('Retrieving rated usage for id %s', id);

    // Retrieve and return the metered usage doc without _id and _rev
     const doc = omit(dbclient.undbify(yield logdb.get(id)),
      'last_rated_usage_id');

    // return the doc as response body
     return {
       body: doc
     };
   }));

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
  app.use(routes);
  app.use(router.batch(routes));
  return app;
};

// Command line interface, create the rate app and listen
const runCLI = () => rateapp().listen();

// Export public methods
module.exports = rateapp;
module.exports.rate = rate;
module.exports.runCLI = runCLI;

