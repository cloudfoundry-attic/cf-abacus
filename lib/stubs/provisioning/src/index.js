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

const pick = _.pick;
const extend = _.extend;

/* jshint noyield: true */

// Setup debug log
const debug = require('abacus-debug')('abacus-provisioning-stub');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

const uris = urienv({
  couchdb: 5984
});

// Configure resource config db
const resourceDb = yieldable(retry(breaker(batch(dbclient(
  partition, dbclient.dburi(uris.couchdb, 'abacus-resource-config'))))));

// Create an express router
const routes = router();

// Onnboard new resource config
const newResourceConfig = function * (rid, resourceConfig) {
  schemas.resourceConfig.validate(resourceConfig);
  debug('Inserting new resource config with id %s active from %s',
    rid, resourceConfig.effective);
  const id = dbclient.kturi(rid , resourceConfig.effective);
  yield resourceDb.put(extend({}, resourceConfig, {
    _id: id }));
};

// Attempts to find a resource config at a given point in time. If resource
// config is not found, the config is loaded from the resources
// directory. Also it is persisted in the database with effective date.
const config = function * (rid, time) {
  debug('Finding resource config for resource id %s at time %s', rid, time);
  let doc;
  try {
    doc = require('./resources/' + rid);
    if(doc.effective > time)
      doc = undefined;
  }
  catch (ex) {
    debug('No resource config found for id %s at time %s in local resources',
      rid, time);
  }
  if(!doc) {
    const options = {
      startkey:  dbclient.kturi(rid , time),
      endkey: dbclient.kturi(rid , 0),
      descending: true,
      limit: 1,
      include_docs:true
    };
    doc = yield resourceDb.allDocs(options);
    if(doc && doc.rows && doc.rows.length === 1) {
      debug('Found resource config %o', doc);
      debug(doc);
      doc = dbclient.undbify(doc.rows[0].doc);
    }
    else {
      debug('No resource config found for id %s at time %s in database',
        rid, time);
      doc = undefined;
    }
  }
  return doc;
};

// Validate that the given ids are all valid and represent a valid path to
// a resource instance (for example that the given app is or was bound at some
// point to that particular instance) and return provisioning information
// for that resource instance
routes.get(
  '/v1/provisioning/regions/:region/orgs/:org_id/spaces/:space_id/consumers/' +
  ':consumer_id/resources/:resource_id/plans/:plan_id/instances/' +
  ':resource_instance_id/:time', function *(req) {
    const path = extend(pick(req.params,
      'region', 'org_id', 'space_id', 'consumer_id',
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

    const conf = yield config(req.params.resource_id,
      parseInt(req.params.time));
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
      yield newResourceConfig(req.params.resource_id,
        req.body);
      return {
        status: 204
      };
    });

// Create a provisisioning stub app
const provisioning = () => {
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
