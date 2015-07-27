'use strict';

// Stub for an account management service. An account is a collection of
// organizations managed by a single billing entity. Usage is aggregated at the
// account level (in addition to organization level) to provide billing systems
// with the usage data they need for billing.

const _ = require('underscore');
const webapp = require('cf-abacus-webapp');
const router = require('cf-abacus-router');

const extend = _.extend;

/* jshint noyield: true */

// Setup debug log
const debug = require('cf-abacus-debug')('cf-abacus-provisioning-stub');

// Create an express router
const routes = router();

// The fake account returned by the stub
const fake = { account_id: '1234', organizations: ['org_123', 'org_456', 'org_789'] };

// Retrieve and return an account
routes.get('/v1/accounts/:account_id', function *(req) {
    debug('Retrieving account %s', req.params.account_id);

    // This is a stub here so we always succeed and return our fake account
    return { status: 200, body: extend({ account_id: req.params.account_id }, fake) };
});

// Retrieve and return the account containing the given org
routes.get('/v1/orgs/:org_id/account', function *(req) {
    debug('Retrieving account containing org %s', req.params.org_id);

    // This is a stub here so we always succeed and return our fake account
    return { status: 200, body: fake };
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

