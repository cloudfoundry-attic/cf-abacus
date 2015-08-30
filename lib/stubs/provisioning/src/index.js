'use strict';

// Stub for a provisioning service that works off a history of what has been
// provisioned over time (and can retrieve and validate info about provisioned
// resources after they've been deleted).

const _ = require('underscore');
const webapp = require('abacus-webapp');
const router = require('abacus-router');

const pick = _.pick;

/* jshint noyield: true */

// Setup debug log
const debug = require('abacus-debug')('abacus-provisioning-stub');

// Create an express router
const routes = router();

// Validate that the given ids are all valid and represent a valid path to
// a resource instance (for example that the given app is or was bound at some
// point to that particular instance) and return provisioning information
// for that resource instance
routes.get(
  '/v1/provisioning/regions/:region/orgs/:org_id/spaces/:space_id/consumers/' +
  ':consumer_id/resources/:resource_id/plans/:plan_id/instances/' +
  ':resource_instance_id', function *(req) {
    const path = pick(req.params, 'region', 'org_id', 'space_id',
      'consumer_id', 'resource_id', 'plan_id', 'resource_instance_id');
    debug('Retrieving info for resource instance %o', path);

    // This is a stub here so we always succeed and just return back what was
    // passed in
    return {
      status: 200,
      body: path
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

