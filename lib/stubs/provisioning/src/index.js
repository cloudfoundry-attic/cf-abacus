'use strict';

// Stub for a provisioning service that works off a history of what has been
// provisioned over time (and can retrieve and validate info about provisioned
// resources after they've been deleted).

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
const debug = require('abacus-debug')('abacus-provisioning-stub');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

const uris = urienv({
  couchdb: 5984
});

// Configure metering config db
const db = yieldable(retry(breaker(batch(
  dbclient(partition.singleton,
  dbclient.dburi(uris.couchdb, 'abacus-metering-config'))))));

// Create an express router
const routes = router();

// Return the type of a resource
const rtype = function *(rid) {
  // This is just a minimal example implementation here, we simply return
  // the given resource id
  return rid;
};

// Return the metering plan id for a given resource type, provisioning
// plan at a given time
const mpid = function *(rtype, pid, time) {
  // This is just a minimal example implementation here, we simply return
  // the given provisioning plan id 
  return pid;
};

// Store a new metering plan config
const newConfig = function *(mpid, conf) {
  schemas.meteringConfig.validate(conf);
  debug('Storing new metering plan config with id %s',
    mpid);
  const id = dbclient.kturi(mpid, 0);
  yield db.put(extend({}, conf, {
    _id: id }));
};

// Maintain a cache of metering plan configs
const configs = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a metering plan config
const cache = (k, mc) => {
  configs.set(k, mc);
  return mc;
};

// Return a metering plan config from the cache
const cached = (k) => {
  return configs.get(k);
};

// Retrieve a metering plan config. Search in a local resources directory
// first, then in the resource config database.
const config = function *(mpid) {
  const unlock = yield lock(mpid);
  try {
    debug('Retrieving metering plan config %s', mpid);

    // Look in our cache first
    const cc = cached(mpid);
    if(cc) {
      debug('Resource config %s found in cache',
        mpid);
      return cc;
    }

    // Look in the local resources dir
    try {
      const c = require('./plans/metering/' + mpid);
      if(c)
        return cache(mpid, c);
    }
    catch (e) {
    }
    debug(
      'No metering plan config %s found in local plan configs', mpid);

    // Look in the provisioning db
    const docs = yield db.allDocs({
      startkey:  dbclient.kturi(mpid , 0),
      endkey: dbclient.kturi(mpid , 0),
      descending: true,
      limit: 1,
      include_docs:true
    });
    if(docs && docs.rows && docs.rows.length === 1) {
      debug('Found metering plan config %o', docs.rows[0].doc);
      return cache(mpid, dbclient.undbify(docs.rows[0].doc));
    }
    debug('No metering plan config %s found in database',
      mpid);
    return undefined;
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
  '/v1/provisioning/orgs/:org_id/spaces/:space_id/consumers/' +
  ':consumer_id/resources/:resource_id/plans/:plan_id/instances/' +
  ':resource_instance_id/:time', function *(req) {
  const path = extend(pick(req.params,
    'org_id', 'space_id', 'consumer_id',
    'resource_id', 'plan_id', 'resource_instance_id'), {
      time: parseInt(req.params.time)
    });
  debug('Retrieving info for resource instance %o', path);

  // This is a stub here so we only validate the resource and plan ids.
  // A real implementation should validate all the parameters and return either
  // 200 if all parameters are valid or 404 if some of the ids or their
  // combinations are not found
  const conf = yield config(
      yield mpid(yield rtype(req.params.resource_id),
        req.params.plan_id, req.params.time));
  if(!conf)
    return {
      status: 404,
      body: path
    };

  return {
    status: 200,
    body: path
  };
});

// Return the metering plan config for a particular metering plan id
routes.get(
  '/v1/metering/plans/:metering_plan_id/config', function *(req) {
    debug('Retrieving metering plan config %s', req.params.metering_plan_id);

    const conf = yield config(req.params.metering_plan_id);
    if(!conf)
      return {
        status: 404
      };

    return {
      status: 200,
      body: conf
    };
  });

// Create a new metering plan config 
routes.post(
  '/v1/metering/plans/:metering_plan_id/config', function *(req) {
    debug('Creating metering plan config with metering plan id %s',
      req.params.metering_plan_id);
    yield newConfig(req.params.metering_plan_id, req.body);
    return {
      status: 204
    };
  });

// Return the resource type for the given resource id.
routes.get(
  '/v1/provisioning/resources/:resource_id/type', function *(req) {
    debug('Identifying the resource type of %s',
      req.params.resource_id);
    return {
      status: 200,
      body: {
        resource_type: yield rtype(req.params.resource_id)
      }
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
