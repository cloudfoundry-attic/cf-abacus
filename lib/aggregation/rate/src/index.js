'use strict';

// Usage rating service

const _ = require('underscore');
const yieldable = require('abacus-yieldable');
const transform = require('abacus-transform');
const batch = require('abacus-batch');
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
const reduce = _.reduce;
const zip = _.zip;
const flatten = _.flatten;
const last = _.last;
const clone = _.clone;
const extend = _.extend;
const omit = _.omit;
const values = _.values;
const sortBy = _.sortBy;
const groupBy = _.groupBy;

const get = yieldable(retry(breaker(request.get)));

const lock = yieldable(lockcb);

/* eslint no-eval: 1 */
/* jshint evil: true */

// Setup debug log
const debug = require('abacus-debug')('abacus-usage-rate');

// Resolve service URIs
const uris = urienv({
  couchdb: 5984,
  account: 9381
});

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

// Return the rated start time for a given time
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
    return f.length && f[0].rate ? eval('(' + f[0].rate + ')') : (p, qty) => 0;
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

// Rates a given aggregated usage
const rate = (u, pc, r) => {
  // Clone only the top level properties except cost since everything else
  // will be overwritten by the new aggregated usage quantities
  const newr = omit(clone(r), 'spaces', 'resources', 'cost');

  // Returns a rated clone of a single resource object
  const rateResource = (resource) => {
    // Retrieve the rate function of the resource
    const ratefn = getratefn(resource.id);

    // Clone the new aggregated usage
    const ratedResource = extend(clone(resource), {
      aggregated_usage: map(resource.aggregated_usage, (a) => {
        return extend(clone(a), { cost: 0});
      })
    });

    // Rate the new aggregated plan usage
    ratedResource.plans = map(resource.plans, (plan) => {
      const ratedPlan = extend(clone(plan), {
        aggregated_usage: map(plan.aggregated_usage, (a) => {
          // Clone the metric quantity and return it along with the cost
          const ratedMetric = extend(clone(a), {
            cost: ratefn(a.unit)(getprice(
              resource.id, plan.id, a.unit, pc), a.quantity)
          });

          // Sum the plan costs of the metric to the total cost of the metric
          const resourceMetric = filter(ratedResource.aggregated_usage,
            (metric) => { return metric.unit === a.unit; })[0];
          resourceMetric.cost += ratedMetric.cost;
          return ratedMetric;
        })
      });

      // Set the total cost of the plan as the sum of its aggregated usage
      ratedPlan.cost = sumPrice(ratedPlan.aggregated_usage);
      return ratedPlan;
    });

    // Set the total cost of the resource as the sum of its plans
    ratedResource.cost = sumPrice(ratedResource.aggregated_usage);
    return ratedResource;
  };

  newr.resources = map(u.resources, rateResource);
  newr.spaces = map(u.spaces, (space) => {
    const ratedSpace = extend(clone(space), {
      resources: map(space.resources, rateResource),
      consumers: map(space.consumers, (consumer) => {
        const ratedConsumer = extend(clone(consumer), {
          resources: map(consumer.resources, rateResource)
        });
        ratedConsumer.cost = sumPrice(ratedConsumer.resources);
        return ratedConsumer;
      })
    });
    ratedSpace.cost = sumPrice(ratedSpace.resources);
    return ratedSpace;
  });
  newr.cost = sumPrice(newr.resources);

  // Use db and cache revisions from last rated usage
  if(r)
    extend(newr,
      r.dbrev ? { dbrev: r.dbrev, _rev: r._rev } : { _rev: r._rev });
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

// Get rated usage, update and store it
const updateRatedUsage = function *(rid, udocs) {
  debug('Update rated usage for a group of %d usage docs', udocs.length);
  // Lock based on the given org and time period
  const unlock = yield lock(rid);
  try {
    // Retrieve the old rated usage for the given org and time
    const r = yield ratedUsage(rid);

    // Initialize the new rated usage
    let newr = r ? omit(r, 'last_rated_usage_id') :
      { organization_id: udocs[0].u.organization_id, start: udocs[0].u.start,
        end: udocs[0].u.end };

    // Retrieve the pricding country from the account
    const pricingCountry =
      yield accountPricingCountry(udocs[0].u.organization_id);

    // Rate the usage docs
    const rdocs = map(udocs, (udoc) => {
      newr = rate(udoc.u, pricingCountry, newr);
      return newr;
    });

    // Store the final new rated usage
    const ludoc = last(udocs);
    yield storeRatedUsage(newr, rid, ludoc.rlogid, ludoc.uid);

    return rdocs;
  }
  finally {
    unlock();
  }
};

// Rate usage by batching individual calls and then
// by grouping them using the given org and time period
const batchRateUsage = yieldable(batch((b, cb) => {
  // Map individual rated usage into a batch response array and
  // then call the callback
  const bcb = (err, rdocs) => err ?
    cb(err) : cb(null, map(rdocs, (rdoc) => [null, rdoc]));

  transform.map(b, (args, i, b, mcb) => {
    // Map individual call arguments into a call object
    mcb(null, { i: i, rid: args[1],
      udoc: { u: args[0], rlogid: args[2], uid: args[3] } });
  }, (err, objs) => {
    if (err) return cb(err);

    // Group the transformed call objects using the given org and time period
    const groups = values(groupBy(objs, (obj) => obj.rid));

    // Call updateRatedUsage for each group
    transform.map(groups, (group, i, groups, mcb) => {
      yieldable.functioncb(updateRatedUsage)(group[0].rid,
        map(group, (obj) => obj.udoc), (err, rdocs) => {
          // Zip grouped call objects with corresponding rated usage
          return mcb(null, zip(group,
            err ? map(group, (obj) => ({ error: err })) : rdocs));
        });
    }, (err, objs) => {
      if (err) return bcb(err);

      // Order the zipped call objects using the original call index of
      // the batch and then return the ordered rated usage
      bcb(null, map(sortBy(flatten(objs, true), (obj) => obj[0].i),
        (obj) => obj[1]));
    });
  });
}));


// Rate the given usage
const rateUsage = function *(u) {
  // Compute the rated usage id and the rated usage log id
  const rid = dbclient.kturi(u.organization_id, day(u.end));
  const rlogid = dbclient.kturi(u.organization_id, [
    day(u.end), seqid()].join('-'));

  // Rate the usage
  const newr = yield batchRateUsage(u, rid, rlogid, u.id);

  // Log the rated usage
  const rlogdoc = extend(clone(newr), {
    id: rlogid, aggregated_usage_id: u.id });
  yield logRatedUsage(rlogdoc, rlogid);

  return rlogid;
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
  const doc = omit(yield logdb.get(req.params.id),
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

