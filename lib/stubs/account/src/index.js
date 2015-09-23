'use strict';

// Stub for an account management service. An account is a collection of
// organizations managed by a single billing entity. Usage is aggregated at the
// account level (in addition to organization level) to provide billing systems
// with the usage data they need for billing.

const _ = require('underscore');
const webapp = require('abacus-webapp');
const router = require('abacus-router');

const extend = _.extend;
const clone = _.clone;

/* jshint noyield: true */

// Setup debug log
const debug = require('abacus-debug')('abacus-account-stub');

// Create an express router
const routes = router();

// The fake test account returned by the stub
const fake = {
  account_id: '1234',
  organizations: [
    'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
    'b3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
    'c3d7fe4d-3cb1-4cc3-a831-ffe98e20cf29'],
  pricing_country: 'USA'
};

// Retrieve and return an account
routes.get('/v1/accounts/:account_id', function *(req) {
  debug('Retrieving account %s', req.params.account_id);

  // This is a stub here so we always succeed and return our fake account
  return {
    status: 200,
    body: extend(clone(fake), { account_id: req.params.account_id })
  };
});

// Retrieve and return the account containing the given org
routes.get('/v1/orgs/:org_id/account', function *(req) {
  debug('Retrieving account containing org %s', req.params.org_id);

  // This is a stub here so we always succeed and return our fake account
  return {
    status: 200,
    body: extend(clone(fake), { organizations: [req.params.org_id] })
  };
});

// Create an account management stub application
const accountManagement = () => {
  const app = webapp();
  app.use(routes);
  app.use(router.batch(routes));
  return app;
};

// Command line interface, create the app and listen
const runCLI = () => accountManagement().listen();

// Export our public functions
module.exports = accountManagement;
module.exports.runCLI = runCLI;

