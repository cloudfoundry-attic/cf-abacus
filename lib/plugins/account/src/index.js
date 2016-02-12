'use strict';

// Minimal example implementation of an Abacus account management plugin.

// An account is a collection of organizations managed by a single billing
// entity. An account plugin provides REST APIs used by the Abacus usage
// processing pipeline to retrieve information about the account owning an
// organization, and the rating plans and pricing plans which should be used
// to rate resource usage incurred by that organization.

// This minimal Abacus account management plugin example is provided only for
// demo and test purposes. An integrator of Abacus is expected to replace it
// with a real production implementation.

const _ = require('underscore');
const webapp = require('abacus-webapp');
const router = require('abacus-router');
const oauth = require('abacus-oauth');
const schemas = require('abacus-usage-schemas');
const dbclient = require('abacus-dbclient');
const partition = require('abacus-partition');
const lockcb = require('abacus-lock');
const urienv = require('abacus-urienv');
const retry = require('abacus-retry');
const batch = require('abacus-batch');
const breaker = require('abacus-breaker');
const yieldable = require('abacus-yieldable');
const lru = require('abacus-lrucache');

const extend = _.extend;

const rlock = yieldable(lockcb);
const plock = yieldable(lockcb);

/* jshint noyield: true */

// Setup debug log
const debug = require('abacus-debug')('abacus-account-plugin');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

const uris = urienv({
  db: 5984
});

// Configure rating plan db
const ratingdb = yieldable(retry(breaker(batch(
  dbclient(partition.singleton,
  dbclient.dburi(uris.db, 'abacus-rating-plans'))))));

// Configure pricing plan db
const pricingdb = yieldable(retry(breaker(batch(
  dbclient(partition.singleton,
  dbclient.dburi(uris.db, 'abacus-pricing-plans'))))));

// Create an express router
const routes = router();

// Store a new pricing plan
const newPricing = function *(ppid, pp) {
  schemas.pricingPlan.validate(pp);
  debug('Storing new pricing plan %s', ppid);
  const id = ['k', ppid].join('/');
  yield pricingdb.put(extend({}, pp, {
    _id: id
  }));
};

// Maintain a cache of pricing plans
const pricings = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a pricing plan
const pcache = (k, p) => {
  pricings.set(k, p);
  return p;
};

// Return a pricing plan from the cache
const pcached = (k) => pricings.get(k);

// Store a new rating plan
const newRating = function *(rpid, rp) {
  schemas.ratingPlan.validate(rp);
  debug('Storing new rating plan with id %s', rpid);
  const id = ['k', rpid].join('/');
  yield ratingdb.put(extend({}, rp, {
    _id: id
  }));
};

// Maintain a cache of rating plans
const ratings = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a rating plan
const rcache = (k, r) => {
  ratings.set(k, r);
  return r;
};

// Return a rating plan from the cache
const rcached = (k) => ratings.get(k);

// The example account returned by the plugin
const sampleAccount = {
  account_id: '1234',
  organizations: [
    'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
    'b3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
    'c3d7fe4d-3cb1-4cc3-a831-ffe98e20cf29'],
  pricing_country: 'USA'
};

// Map from (resource_type, provisioning plan_id) to example pricing plan id
const samplePricings = {
  analytics: {
    basic: 'analytics-pricing-basic',
    standard: 'analytics-pricing-standard'
  },
  'linux-container': {
    basic: 'linux-pricing-basic',
    standard: 'linux-pricing-standard'
  },
  'object-storage': {
    basic: 'object-pricing-basic',
    standard: 'object-pricing-standard'
  },
  'test-resource': {
    basic: 'test-pricing-basic',
    standard: 'test-pricing-standard'
  },
  'test-db': {
    basic: 'test-db-basic'
  }
};

// Map a resource type and provisioning plan id to a pricing plan id
const ppid = function *(rt, pid) {
  // Return our example pricing plan ids
  return samplePricings[rt] ? samplePricings[rt][pid] : undefined;
}

// Map from (resource_type, provisioning plan_id) to example rating plan id
const sampleRatings = {
  analytics: {
    basic: 'analytics-rating-plan',
    standard: 'analytics-rating-plan'
  },
  'linux-container': {
    basic: 'linux-rating-plan',
    standard: 'linux-rating-plan'
  },
  'object-storage': {
    basic: 'object-rating-plan',
    standard: 'object-rating-plan'
  },
  'test-resource': {
    basic: 'basic-test-rating-plan',
    standard: 'standard-test-rating-plan'
  }
};

// Map a resource type and provisioning plan id to a rating plan id
const rpid = function *(rt, pid) {
  return sampleRatings[rt] ? sampleRatings[rt][pid] : undefined;
}

// Retrieve a rating plan. Search in local resources first, then in the rating
// plan database
const rating = function *(rpid) {
  const unlock = yield rlock(rpid);
  try {
    debug('Retrieving rating plan %s', rpid);

    // Look in cache
    const crp = rcached(rpid);
    if(crp) {
      debug('Rating plan %s found in cache', rpid);
      return crp;
    }

    // Look in local resources
    try {
      return rcache(rpid, schemas.ratingPlan.validate(
        require('./plans/rating/' + rpid)));
    }
    catch(e) {
    }
    debug('Rating plan %s not found in local resources', rpid);

    // Look in the rating plan database
    const doc = yield ratingdb.get(['k', rpid].join('/'));
    return doc ? rcache(rpid, dbclient.undbify(doc)) : doc;
  }
  finally {
    unlock();
  }
};

// Retrieve a pricing plan. Search in local resources first, then in the
// pricing plan database
const pricing = function *(ppid) {
  const unlock = yield plock(ppid);
  try {
    debug('Retrieving pricing plan %s', ppid);

    // Look in cache
    const cpp = pcached(ppid);
    if(cpp) {
      debug('Pricing plan %s found in cache', ppid);
      return cpp;
    }
    // Look in local resources
    try {
      return pcache(ppid, schemas.pricingPlan.validate(
        require('./plans/pricing/' + ppid)));
    }
    catch(e) {
    }
    debug('Pricing plan %s not found in local resources', ppid);

    // Look in the pricing database
    const doc = yield pricingdb.get(['k', ppid].join('/'));
    return doc ? pcache(ppid, dbclient.undbify(doc)) : doc;
  }
  finally {
    unlock();
  }
};

// Retrieve and return an account
routes.get('/v1/accounts/:account_id', function *(req) {
  debug('Retrieving account %s', req.params.account_id);

  // Always succeed and return our example account
  return {
    status: 200,
    body: extend({}, sampleAccount, { account_id: req.params.account_id })
  };
});

// Retrieve and return the account owning the given org at the given time
routes.get('/v1/organizations/:org_id/account/:time', function *(req) {
  debug('Retrieving account owning org %s', req.params.org_id);

  // Always succeed and return our example account
  return {
    status: 200,
    body: extend({}, sampleAccount, { organizations: [req.params.org_id] })
  };
});

// Return the pricing plan to use for the given resource type, provisioning
// plan at the given time
routes.get(
  '/v1/pricing/organizations/:organization_id/resource_types/' +
  ':resource_type/plans/:plan_id/time/:time/pricing_plan/id', function *(req) {
  debug('Retrieving pricing plan for resource type %s and plan %s at time %d',
    req.params.resource_type, req.params.plan_id, req.params.time);

  // Lookup the pricing plan id
  const id = yield ppid(req.params.resource_type, req.params.plan_id);
  if (!id)
    return {
      status: 404
    };

  return {
    status: 200,
    body: id
  };
});

// Return the specified pricing plan
routes.get(
  '/v1/pricing/plans/:pricing_plan_id', function *(req) {
    debug('Retrieving pricing plan %s', req.params.pricing_plan_id);

    const pp = yield pricing(req.params.pricing_plan_id);
    if(!pp)
      return {
        status: 404
      };
    return {
      status: 200,
      body: pp
    };
  });

// Return the rating plan id to use for the given resource type, provisioning
// plan at the given time
routes.get(
  '/v1/rating/organizations/:organization_id/resource_types/' +
  ':resource_type/plans/:plan_id/time/:time/rating_plan/id', function *(req) {
  debug('Retrieving rating plan for resource type %s and plan %s at time %d',
    req.params.resource_type, req.params.plan_id, req.params.time);

  // Lookup the rating plan id
  const id = yield rpid(req.params.resource_type, req.params.plan_id);
  if (!id)
    return {
      status: 404
    }
  return {
    status: 200,
    body: id
  };
});

// Return the specified rating plan
routes.get(
  '/v1/rating/plans/:rating_plan_id', function *(req) {
    debug('Retrieving rating plan %s', req.params.rating_plan_id);

    const rp = yield rating(req.params.rating_plan_id);
    if(!rp)
      return {
        status: 404
      };
    return {
      status: 200,
      body: rp
    };
  });

// Store a new rating plan
routes.post(
  '/v1/rating/plans/:rating_plan_id', function *(req) {
    debug('Storing rating plan with rating plan id %s',
      req.params.rating_plan_id);
    yield newRating(req.params.rating_plan_id, req.body);
    return {
      status: 201
    };
  });

// Store a new pricing plan
routes.post(
  '/v1/pricing/plans/:pricing_plan_id', function *(req) {
    debug('Storing pricing plan %s',
      req.params.pricing_plan_id);
    yield newPricing(req.params.pricing_plan_id, req.body);
    return {
      status: 201
    };
  });

// Create an account plugin app
const accounts = () => {
  // Create the Webapp
  const app = webapp();

  // Secure accounts, orgs, pricing and batch routes using an OAuth
  // bearer access token
  if (secured())
    app.use(/^\/v1\/(accounts|organizations|pricing|rating)|^\/batch$/,
      oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  app.use(routes);
  app.use(router.batch(app));

  return app;
};

// Command line interface, create the app and listen
const runCLI = () => accounts().listen();

// Export our public functions
module.exports = accounts;
module.exports.runCLI = runCLI;
