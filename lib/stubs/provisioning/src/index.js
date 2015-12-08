'use strict';

// Stub for a provisioning service that works off a history of what has been
// provisioned over time (and can retrieve and validate info about provisioned
// resources after they've been deleted).

const _ = require('underscore');
const webapp = require('abacus-webapp');
const router = require('abacus-router');
const oauth = require('abacus-cfoauth');
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

// Configure resource config db
const db = yieldable(retry(breaker(batch(
  dbclient(partition.singleton,
  dbclient.dburi(uris.couchdb, 'abacus-resource-config'))))));

// Create an express router
const routes = router();

// Store a new resource config
const newConfig = function * (rid, conf) {
  schemas.resourceConfig.validate(conf);
  debug('Storing new resource config with id %s effective from %s',
    rid, conf.effective);
  const id = dbclient.kturi(rid , conf.effective);
  yield db.put(extend({}, conf, {
    _id: id }));
};

// Maintain a cache of resource configs
const configs = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a resource config
const cache = (k, resource) => {
  configs.set(k, resource);
  return resource;
};

// Return a resource config from the cache
const cached = (k) => {
  return configs.get(k);
};

// Search for a resource config effective at given time. Search in a local
// resources directory first, then in the resource config database.
const config = function * (rid, time) {
  // Round time to a 10 min boundary
  const t = Math.floor(time / 600000) * 600000;
  const k = [rid, t].join('/');

  const unlock = yield lock(k);
  try {
    debug('Retrieving config for resource %s effective %d', rid, t);

    // Look in our cache first
    const cc = cached(k);
    if(cc) {
      debug('Resource config %s effective from %s found in cache',
        rid, time);
      return cc;
    }

    // Look in the local resources dir
    try {
      const c = require('./resources/' + rid);
      if(c && c.effective <= time)
        return cache(k, c);
    }
    catch (e) {
    }
    debug(
      'No resource config %s effective from %s found in local resources',
      rid, time);

    // Look in the provisioning db
    const docs = yield db.allDocs({
      startkey:  dbclient.kturi(rid , t),
      endkey: dbclient.kturi(rid , 0),
      descending: true,
      limit: 1,
      include_docs:true
    });
    if(docs && docs.rows && docs.rows.length === 1) {
      debug('Found resource config %o', docs.rows[0].doc);
      return cache(k, dbclient.undbify(docs.rows[0].doc));
    }
    debug('No resource config %s effective from %s found in database',
      rid, time);
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

  // This is a stub here so we only validate the resource_id. A complete
  // implementation of this service should validate all the other
  // parameters
  if(!(yield config(req.params.resource_id, parseInt(req.params.time))))
    return {
      status: 404
    };

  return {
    status: 200,
    body: path
  };
});

// Return the resource configuration for a particular resource id and
// effective time (allowing evolution of configurations over time, where
// different versions of a resource configuration will be used at different
// points in time)
routes.get(
  '/v1/provisioning/resources/:resource_id/config/:time', function *(req) {
    debug('Retrieving resource config %s at time %d',
      req.params.resource_id, req.params.time);

    const conf = yield config(
      req.params.resource_id, parseInt(req.params.time));
    if(!conf)
      return {
        status: 404
      };

    return {
      status: 200,
      body: conf
    };
  });

// Create a new resource config valid from the time mentioned in the
// effective field.
routes.post(
    '/v1/provisioning/resources/:resource_id/config', function *(req) {
      debug('Creating resource config with resource id %s',
        req.params.resource_id);
      yield newConfig(req.params.resource_id, req.body);
      return {
        status: 204
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
