'use strict';

// Stub for a provisioning service that works off a history of what has been
// provisioned over time (and can retrieve and validate info about provisioned
// resources after they've been deleted).

const _ = require('underscore');
const webapp = require('abacus-webapp');
const router = require('abacus-router');
const schemas = require('abacus-usage-schemas');

const pick = _.pick;
const extend = _.extend;

/* jshint noyield: true */

// Setup debug log
const debug = require('abacus-debug')('abacus-provisioning-stub');

// Create an express router
const routes = router();

// Load and return a resource config
const config = (rid, time) => {
  try {
    return require('./resources/' + rid);
  }
  catch(e) {
    return undefined;
  }
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
    if(!config(req.params.resource_id, parseInt(req.params.time)))
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
  '/v1/provisioning/resource/config/:resource_id/:time', function *(req) {
    debug('Retrieving resource config %s at time %d',
      req.params.resource_id, req.params.time);

    // This is a stub here so we just return our sample resource configs
    const conf = config(req.params.resource_id, parseInt(req.params.time));
    if(!conf)
      return {
        status: 404
      };

    // Validate and return the resource config
    schemas.resourceConfig.validate(conf);
    return {
      status: 200,
      body: require('./resources/' + req.params.resource_id)
    };
  });

// Create a provisisioning stub app
const provisioning = () => {
  const app = webapp();
  app.use(routes);
  app.use(router.batch(routes));
  return app;
};

// Command line interface, create the app and listen
const runCLI = () => provisioning().listen();

// Export our public functions
module.exports = provisioning;
module.exports.runCLI = runCLI;

