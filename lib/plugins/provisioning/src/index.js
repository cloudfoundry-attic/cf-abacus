'use strict';

// Minimal example implementation of an Abacus provisioning plugin.

// A provisioning plugin provides REST APIs used by the Abacus usage
// processing pipeline to retrieve information about provisioned resources
// and the metering plans which should be used to meter their usage.

// This minimal Abacus provisioning plugin example is provided only for demo
// and test purposes. An integrator of Abacus is expected to replace it with
// a real production implementation.

const _ = require('underscore');
const webapp = require('abacus-webapp');
const router = require('abacus-router');
const oauth = require('abacus-oauth');
const schemas = require('abacus-usage-schemas');
const urienv = require('abacus-urienv');
const dbclient = require('abacus-dbclient');
const partition = require('abacus-partition');
const batch = require('abacus-batch');
const retry = require('abacus-retry');
const breaker = require('abacus-breaker');
const yieldable = require('abacus-yieldable');
const lockcb = require('abacus-lock');
const lru = require('abacus-lrucache');

const pick = _.pick;
const extend = _.extend;

const mlock = yieldable(lockcb);
const rlock = yieldable(lockcb);
const plock = yieldable(lockcb);

/* jshint noyield: true */

// Setup debug log
const debug = require('abacus-debug')('abacus-provisioning-plugin');

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

// Configure metering plan db
const meteringdb = yieldable(retry(breaker(batch(
  dbclient(partition.singleton,
    dbclient.dburi(uris.db, 'abacus-metering-plans'))))));

// Create an express router
const routes = router();

// Return the type of a resource
const rtype = function *(rid) {
  // This is just a minimal example implementation, we simply return the
  // given resource id
  return rid;
};


// Map from (resource_type, provisioning plan_id) to example metering plan id
const sampleMetering = {
  analytics: {
    basic: 'basic-analytics',
    standard: 'basic-analytics'
  },
  'linux-container': {
    basic: 'basic-linux-container',
    standard: 'standard-linux-container'
  },
  'object-storage': {
    basic: 'basic-object-storage',
    standard: 'standard-object-storage'
  },
  'test-resource': {
    basic: 'test-metering-plan',
    standard: 'test-metering-plan'
  }
};

// Map a resource type and provisioning plan id to a metering plan id
const mpid = function *(rtype, pid) {
  return sampleMetering[rtype] ? sampleMetering[rtype][pid] : undefined;
};




// Maintain a cache of metering plans
const meteringplans = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a metering plan
const mcache = (k, mp) => {
  meteringplans.set(k, mp);
  return mp;
};

// Return a metering plan from the cache
const mcached = (k) => {
  return meteringplans.get(k);
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

// Store a new metering plan
const newMetering = function *(mpid, mp) {
  schemas.meteringPlan.validate(mp);
  debug('Storing new metering plan %s', mpid);
  const id = ['k', mpid].join('/');
  yield meteringdb.put(extend({}, mp, {
    _id: id
  }));
};

// Store a new rating plan
const newRating = function *(rpid, rp) {
  schemas.ratingPlan.validate(rp);
  debug('Storing new rating plan with id %s', rpid);
  const id = ['k', rpid].join('/');
  yield ratingdb.put(extend({}, rp, {
    _id: id
  }));
};

// Store a new pricing plan
const newPricing = function *(ppid, pp) {
  schemas.pricingPlan.validate(pp);
  debug('Storing new pricing plan %s', ppid);
  const id = ['k', ppid].join('/');
  yield pricingdb.put(extend({}, pp, {
    _id: id
  }));
};

// Retrieve a metering plan. Search in local resources first, then in the
// metering plan database
const metering = function *(mpid) {
  const unlock = yield mlock(mpid);
  try {
    debug('Retrieving metering plan %s', mpid);

    // Look in our cache first
    const cp = mcached(mpid);
    if(cp) {
      debug('Metering plan %s found in cache', mpid);
      return cp;
    }

    // Look in local resources
    try {
      const p = require('./plans/metering/' + mpid);
      return mcache(mpid, p);
    }
    catch(e) {}

    debug('Metering plan %s not found in local resources', mpid);

    // Look in the metering plan db
    const doc = yield meteringdb.get(['k', mpid].join('/'));
    return doc ? mcache(mpid, dbclient.undbify(doc)) : doc;
  }
  finally {
    unlock();
  }
};

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
    catch(e) {}
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
    catch(e) {}
    debug('Pricing plan %s not found in local resources', ppid);

    // Look in the pricing database
    const doc = yield pricingdb.get(['k', ppid].join('/'));
    return doc ? pcache(ppid, dbclient.undbify(doc)) : doc;
  }
  finally {
    unlock();
  }
};

// Validate that the given ids are all valid and represent a valid path to
// a resource instance (for example that the given app is or was bound at some
// point to that particular instance) and return provisioning information
// for that resource instance
routes.get(
  '/v1/provisioning/organizations/:org_id/spaces/:space_id/consumers/' +
  ':consumer_id/resources/:resource_id/plans/:plan_id/instances/' +
  ':resource_instance_id/:time',
  function *(req) {
    const path = extend(pick(req.params, 'org_id', 'space_id', 'consumer_id',
    'resource_id', 'plan_id', 'resource_instance_id'), {
      time: parseInt(req.params.time)
    });
    debug('Retrieving info for resource instance %o', path);

    // This is a plugin here so we only validate the resource and plan ids.
    // A real implementation should validate all the parameters and return
    // either 200 if all parameters are valid or 404 if some of the ids
    // or their combinations are not found
    const id = yield mpid(
      yield rtype(req.params.resource_id), req.params.plan_id);
    if(!id)
      return {
        status: 404
      };

    const mp = yield metering(id);
    if(!mp)
      return {
        status: 404,
        body: path
      };
    return {
      status: 200,
      body: path
    };
  });

// Return the resource type for the given resource id.
routes.get(
  '/v1/provisioning/resources/:resource_id/type',
  function *(req) {
    debug('Identifying the resource type of %s', req.params.resource_id);
    return {
      status: 200,
      body: yield rtype(req.params.resource_id)
    };
  });

// Create a new metering plan
routes.post(
  '/v1/metering/plans/:metering_plan_id',
  function *(req) {
    debug('Creating metering plan %s', req.params.metering_plan_id);
    yield newMetering(req.params.metering_plan_id, req.body);
    return {
      status: 201
    };
  });

// Store a new rating plan
routes.post(
  '/v1/rating/plans/:rating_plan_id',
  function *(req) {
    debug('Storing rating plan with rating plan id %s',
      req.params.rating_plan_id);
    yield newRating(req.params.rating_plan_id, req.body);
    return {
      status: 201
    };
  });

// Store a new pricing plan
routes.post(
  '/v1/pricing/plans/:pricing_plan_id',
  function *(req) {
    debug('Storing pricing plan %s',
      req.params.pricing_plan_id);
    yield newPricing(req.params.pricing_plan_id, req.body);
    return {
      status: 201
    };
  });

// Return the specified metering plan
routes.get(
  '/v1/metering/plans/:metering_plan_id',
  function *(req) {
    debug('Retrieving metering plan %s', req.params.metering_plan_id);

    const mp = yield metering(req.params.metering_plan_id);
    if(!mp)
      return {
        status: 404
      };
    return {
      status: 200,
      body: mp
    };
  });

// Return the specified rating plan
routes.get(
  '/v1/rating/plans/:rating_plan_id',
  function *(req) {
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

// Return the specified pricing plan
routes.get(
  '/v1/pricing/plans/:pricing_plan_id',
  function *(req) {
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

// Create a provisioning service app
const provisioning = () => {
  // Create the Webapp
  const app = webapp();

  // Secure provisioning and batch routes using an OAuth
  // bearer access token
  if(secured())
    app.use(/^\/v1\/(provisioning|metering|rating|pricing)|^\/batch$/,
      oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  app.use(routes);
  app.use(router.batch(app));

  return app;
};

// Command line interface, create the app and listen
const runCLI = () => provisioning().listen();

// Export our public functions
module.exports = provisioning;
module.exports.runCLI = runCLI;
