'use strict';

// Usage rating service

const _ = require('underscore');
const yieldable = require('abacus-yieldable');
const batch = require('abacus-batch');
const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const dbclient = require('abacus-dbclient');
const urienv = require('abacus-urienv');
const webapp = require('abacus-webapp');
const router = require('abacus-router');
const request = require('abacus-request');
const seqid = require('abacus-seqid');
const lockcb = require('abacus-lock');
const config = require('abacus-resource-config');
const prices = require('abacus-price-config');
const db = require('abacus-aggregation-db');

const map = _.map;
const filter = _.filter;
const clone = _.clone;
const extend = _.extend;
const omit = _.omit;
const reduce = _.reduce;

const get = yieldable(retry(breaker(request.get)));

const lock = yieldable(lockcb);

// Resolve service URIs
const uris = urienv({
  couchdb: 5984,
  account: 9381
});

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-rate');

// Configure rated usage db
const ratedb = yieldable(
  batch(retry(breaker(db(uris.couchdb, 'abacus-rated-usage')))));
const logdb = yieldable(
  batch(retry(breaker(db(uris.couchdb, 'abacus-rated-usage-log')))));

// Configure the rated usage cache
const ratecache = yieldable(db.cache('abacus-rated-usage'));

// Return a doc location given a route template and params
const loc = (req, template, params) => req.protocol + '://' +
  req.headers.host + request.route(template, params);

// Return the aggregation start time for a given time
const day = (t) => {
  const d = new Date(t);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

// Return the pricing country associated with the organization's account
const accountPricingCountry = function *(oid) {
  const account = yield get(uris.account + '/v1/orgs/:org_id/account', {
    org_id: oid
  });
  // Return the default in the case of an undefined country
  if(!account.body || !account.body.pricing_country)
    return 'USA';
  return account.body.pricing_country;
};

// Return a function that returns a rating function for a given resource id
const getratefn = (rid) => {
  // Get all transforms for a given resource id
  const transforms = (config(rid) || {
    transforms: []
  }).transforms;
  return (u) => {
    // Find the transform with the matching unit of the id
    const f = filter(transforms, (t) => t.id === u);
    // If the rating function is defined use it, otherwise use a default
    // function that returns 0
    return f.length && f[0].rate ? f[0].rate : (p, qty) => 0;
  };
};

// Return the price for the given resource, plan, unit, and country
const getprice = (rid, pid, uid, country) => {
  // Retrieve the resource price file
  const resource = prices(rid);
  if(resource) {
    // Find the specific plan of the usage
    const plan = filter(resource.plans, (p) => p.id === pid);
    if(plan.length) {
      // Find the specific unit's price
      const metrics = filter(plan[0].metrics, (r) => r.id === uid);
      // Use the correct price based on country or use 0 if it doesn't exist
      const price = filter(metrics[0].prices, (p) => p.country === country);
      return price.length ? price[0].price : 0;
    }
  }
  return 0;
};

// Takes a list of entities with costs and returns the sum
const sumPrice = (list) => {
  return reduce(list, (prev, curr) => {
    return prev + curr.cost;
  }, 0);
};

// Rates usage at a given aggregation level
const rateusage = (u, pricingCountry) => {
  return extend(clone(u), {
    resources: map(u.resources, (resource) => {
      // Get the rating function based on the given resource
      const ratefn = getratefn(resource.id);

      // Create the initial resourceUsage data
      const resourceUsage = {
        id: resource.id,
        aggregated_usage: map(resource.aggregated_usage, (a) => ({
            unit: a.unit,
            quantity: a.quantity,
            cost: 0
        }))
      };
      // Create the plan structure in the rated usage
      resourceUsage.plans = map(resource.plans, (p) => {
        const planUsage = extend(clone(p), {aggregated_usage:
          map(p.aggregated_usage, (a) => {
            // Apply the calculation to the quantity
            const aggregateUsage = {
              unit: a.unit,
              quantity: a.quantity,
              cost: ratefn(a.unit)(getprice(
              resource.id, p.id, a.unit, pricingCountry), a.quantity)
            };
            // Add to the costs of the resource metric from the plan costs
            const resourceMetric = filter(resourceUsage.aggregated_usage,
              (metric) => { return metric.unit === a.unit; })[0];
            resourceMetric.cost += aggregateUsage.cost;
            return aggregateUsage;
          })
        });

        // Calculate the total cost for the plan
        planUsage.cost = sumPrice(planUsage.aggregated_usage);
        return planUsage;
      });

      // Set the aggregate cost of all the resources
      resourceUsage.cost = sumPrice(resourceUsage.plans);
      return resourceUsage;
    })
  });
};

// Rates a given aggregated usage
const rate = function *(u, r) {
  // Retrieve the pricing country from the account
  const pricingCountry = yield accountPricingCountry(u.organization_id);

  // Rate the organization-level aggregation
  const rated = rateusage(u, pricingCountry);
  rated.cost = sumPrice(rated.resources);

  // Rate the space-level aggregation
  rated.spaces = map(u.spaces, (s) => {
    const ratedspace = rateusage(s, pricingCountry);
    // Rate the consumer-level aggregation
    ratedspace.consumers = map(s.consumers, (c) => {
      const ratedconsumer = rateusage(c, pricingCountry);
      ratedconsumer.cost = sumPrice(ratedconsumer.resources);
      return ratedconsumer;
    });
    ratedspace.cost = sumPrice(ratedspace.resources);
    return ratedspace;
  });
  if(r)
    extend(rated, {_rev: r._rev});
  return rated;
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
const logRatedUsage = function *(rlogdoc, rlogid) {
  debug('Logging rated usage %s', rlogid);
  yield logdb.put(extend(clone(rlogdoc), { _id: rlogid }));
  debug('Logged rated usage %o', rlogdoc);
  return rlogdoc;
};


// Store the rated usage
const storeRatedUsage = function *(r, rid, rlogid, uid) {
  debug('Updating rated usage %s', rid);
  const rdoc = extend(clone(omit(r, 'dbrev')), {
    id: rid, last_rated_usage_id: rlogid, aggregated_usage_id: uid });
  const rrev = yield ratedb.put(extend(clone(rdoc), {
    _id: rid }, r.dbrev ? { _rev: r.dbrev } : {}));
  yield ratecache.put(extend(clone(rdoc), { _id: rid, dbrev: rrev.rev }));
  debug('Updated rated usage %o', rdoc);
  return rid;
};

// Rate the given usage
const rateUsage = function *(u) {
  // Compute the rated log id and the aggregated log id
  const rid = dbclient.kturi(u.organization_id, day(u.end));
  const rlogid = dbclient.kturi(u.organization_id, [
    day(u.end), seqid()].join('-'));
  const uid = u.id;

  const unlock = yield lock(rid);
  let newr;
  try {
    // Retrieve the old rated usage document
    const r = yield ratedUsage(rid);

    // Rate the usage
    newr = yield rate(u, r);

    // Store the rated usage
    yield storeRatedUsage(newr, rid, rlogid, uid);
  }
  finally {
    unlock();
  }
  // Log the rated usage
  const rlogdoc = extend(clone(newr), {
    id: rlogid, aggregated_usage_id: u.id });
  yield logRatedUsage(rlogdoc, rlogid);
  return rid;
};

// Create an express router
const routes = router();

// Rate a given aggregated usage
routes.post('/v1/rating/usage', function *(req) {
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
});

// Retrieve the rated usage associated with the given id
routes.get('/v1/rating/rated/usage/:id', function *(req) {
  debug('Retrieving rated usage for id %s', req.params.id);

  // Retrieve and return the metered usage doc, and clone it without _id and
  // _rev properties
  const doc = omit(yield ratedb.get(req.params.id),
    ['_id', '_rev', 'last_rated_usage_id']);

  // return the doc as response body
  return {
    body: doc
  };
});

// Perform recovery logic when the application starts
const recover = () => {
  // Process any unprocessed docs from our input db

  // TODO insert our recovery logic here
};

// Create a rate app
const rateapp = () => {
  // Perform recovery if necessary
  recover();

  // Create the Webapp
  const app = webapp();
  app.use(routes);
  return app;
};

// Command line interface, create the rate app and listen
const runCLI = () => rateapp().listen();

// Export public methods
module.exports = rateapp;
module.exports.rate = rate;
module.exports.runCLI = runCLI;

