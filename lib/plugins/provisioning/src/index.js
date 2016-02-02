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

const lock = yieldable(lockcb);

/* jshint noyield: true */

// Setup debug log
const debug = require('abacus-debug')('abacus-provisioning-plugin');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

const uris = urienv({
  couchdb: 5984
});

// Configure metering plan db
const db = yieldable(retry(breaker(batch(
  dbclient(partition.singleton,
  dbclient.dburi(uris.couchdb, 'abacus-metering-plans'))))));

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
    basic: 'basic-test-metering-plan',
    standard: 'basic-test-metering-plan'
  }
};

// Map a resource type and provisioning plan id to a metering plan id
const mpid = function *(rtype, pid) {
  return sampleMetering[rtype] ? sampleMetering[rtype][pid] : undefined;
};

// Store a new metering plan
const newMetering = function *(mpid, mp) {
  schemas.meteringPlan.validate(mp);
  debug('Storing new metering plan %s', mpid);
  const id = ['k', mpid].join('/');
  yield db.put(extend({}, mp, {
    _id: id
  }));
};

// Maintain a cache of metering plans
const mplans = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a metering plan
const cache = (k, mp) => {
  mplans.set(k, mp);
  return mp;
};

// Return a metering plan from the cache
const cached = (k) => {
  return mplans.get(k);
};

// Retrieve a metering plan. Search in local resources first, then in the
// metering plan database
const metering = function *(mpid) {
  const unlock = yield lock(mpid);
  try {
    debug('Retrieving metering plan %s', mpid);

    // Look in our cache first
    const cp = cached(mpid);
    if(cp) {
      debug('Metering plan %s found in cache', mpid);
      return cp;
    }

    // Look in local resources
    try {
      const p = require('./plans/metering/' + mpid);
      return cache(mpid, p);
    }
    catch (e) {
    }

    debug('Metering plan %s not found in local resources', mpid);

    // Look in the metering plan db
    const doc = yield db.get(['k', mpid].join('/'));
    return doc ? cache(mpid, dbclient.undbify(doc)) : doc;
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
  ':resource_instance_id/:time', function *(req) {
  const path = extend(pick(req.params,
    'org_id', 'space_id', 'consumer_id',
    'resource_id', 'plan_id', 'resource_instance_id'), {
      time: parseInt(req.params.time)
    });
  debug('Retrieving info for resource instance %o', path);

  // This is a plugin here so we only validate the resource and plan ids.
  // A real implementation should validate all the parameters and return either
  // 200 if all parameters are valid or 404 if some of the ids or their
  // combinations are not found
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

// Return the specified metering plan
routes.get(
  '/v1/metering/plans/:metering_plan_id', function *(req) {
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

// Create a new metering plan
routes.post(
  '/v1/metering/plans/:metering_plan_id', function *(req) {
    debug('Creating metering plan %s', req.params.metering_plan_id);
    yield newMetering(req.params.metering_plan_id, req.body);
    return {
      status: 201
    };
  });

// Return the metering plan id to use for the given resource type, provisioning
// plan at the given time
routes.get(
  '/v1/metering/organizations/:organization_id/resource_types/' +
  ':resource_type/plans/:plan_id/time/:time/metering_plan/id', function *(req) {
  debug(
    'Retrieving metering plan for resource type %s and plan %s at time %d',
    req.params.resource_type, req.params.plan_id, req.params.time);

  // Get the metering plan id
  const id = yield mpid(
    yield rtype(req.params.resource_type), req.params.plan_id);
  if (!id)
    return {
      status: 404
    }

  return {
    status: 200,
    body: id
  };
});

// Return the resource type for the given resource id.
routes.get(
  '/v1/provisioning/resources/:resource_id/type', function *(req) {
    debug('Identifying the resource type of %s', req.params.resource_id);
    return {
      status: 200,
      body: yield rtype(req.params.resource_id)
    };
  });

// Create a provisioning service app
const provisioning = () => {
  // Create the Webapp
  const app = webapp();

  // Secure provisioning and batch routes using an OAuth
  // bearer access token
  if (secured())
    app.use(/^\/v1\/provisioning|^\/batch$/,
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
