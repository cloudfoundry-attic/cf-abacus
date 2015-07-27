'use strict';

// Stub for a provisioning service that works off a history of what has been
// provisioned over time (and can retrieve and validate info about provisioned
// resources after they've been deleted).

const _ = require('underscore');
const webapp = require('cf-abacus-webapp');
const router = require('cf-abacus-router');

const pick = _.pick;

/* jshint noyield: true */

// Setup debug log
const debug = require('cf-abacus-debug')('cf-abacus-provisioning-stub');

// Create an express router
const routes = router();

// Validate that the given ids are all valid and represent a valid path to
// a service instance (for example that the given app is or was bound at some
// point to that particular instance) and return provisioning information
// for that service instance
routes.get('/v1/provisioning/regions/:region/orgs/:org_id/spaces/:space_id/consumers/:app_id/services/:service_id/plans/:plan_id/instances/:service_instance_id', function *(req) {
    const path = pick(req.params, 'region', 'org_id', 'space_id', 'app_id', 'service_id', 'plan_id', 'service_instance_id');
    debug('Retrieving info for service instance %o', path);

    // This is a stub here so we always succeed and just return back what was
    // passed in
    return { status: 200, body: path };
});

// Validate that the given ids are all valid and represent a valid path to
// a runtime (for example that the given app is or was using that runtime at
// some point) and return provisioning information for that runtime
routes.get('/v1/provisioning/regions/:region/orgs/:org_id/spaces/:space_id/consumers/:app_id/runtimes/:runtime_id/plans/:plan_id', function *(req) {
    const path = pick(req.params, 'region', 'org_id', 'space_id', 'app_id', 'runtime_id', 'plan_id');
    debug('Retrieving info for runtime %o', path);

    // This is a stub here so we always succeed and just return back what was
    // passed in
    return { status: 200, body: path };
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

