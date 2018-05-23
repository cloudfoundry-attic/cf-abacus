'use strict';

// Minimal example implementation of an Abacus account management plugin.

// An account is a collection of organizations managed by a single billing entity. An account plugin provides REST APIs
// used by the Abacus usage processing pipeline to retrieve information about the account owning an organization, and
// the rating plans and pricing plans which should be used to rate resource usage incurred by that organization.

// This minimal Abacus account management plugin example is provided only for demo and test purposes. An integrator of
// Abacus is expected to replace it with a real production implementation.

const { extend } = require('underscore');

const oauth = require('abacus-oauth');
const mappings = require('abacus-plan-mappings');
const router = require('abacus-router');
const webapp = require('abacus-webapp');
const yieldable = require('abacus-yieldable');

/* jshint noyield: true */

const debug = require('abacus-debug')('abacus-account-plugin');
const edebug = require('abacus-debug')('e-abacus-account-plugin');

const secured = () => process.env.SECURED === 'true' ? true : false;

const routes = router();

// Return the type of a resource
const rtype = function*(rid) {
  // This is just a minimal example implementation, we simply return the given resource id
  return rid;
};

// For example: https://authentication.cf.sap.hana.ondemand.com
const accountTokenURI = process.env.ACCOUNT_TOKEN_URI;

// For example: https://authentication.cf.sap.hana.ondemand.com/sap/rest/authorization/tenants
const accountBackend = process.env.ACCOUNT_BACKEND;

const accountBackendToken = oauth.cache(
  accountTokenURI,
  process.env.CLIENT_ID,
  process.env.CLIENT_SECRET,
  undefined, // scopes
  undefined, // path
  true
);

const accountsRepo = require('./lib/account-backend');
const getAccount = accountsRepo(accountBackend, accountBackendToken);
const getAccountInfo = yieldable(getAccount);

// Retrieve and return an account
routes.get('/v1/accounts/:account_id', function*(req) {
  debug('Retrieving account %s', req.params.account_id);

  // Always succeed and return our example account
  return {
    status: 200,
    body: extend({}, accountsRepo.sampleAccount, {
      account_id: req.params.account_id
    })
  };
});

// Retrieve and return the account owning the given org at the given time
routes.get('/v1/organizations/:org_id/account/:time', function*(req) {
  debug('Retrieving account owning org %s', req.params.org_id);
  const accountInfo = yield getAccountInfo(req.params.org_id);
  if (accountInfo)
    return {
      status: 200,
      body: accountInfo
    };

  return {
    status: 404,
    body: {
      error: `Missing account information for organization ${req.params.org_id}`
    }
  };
});

// Return the metering plan id to use for the given organization, resource type, provisioning plan at the given time
routes.get(
  '/v1/metering/organizations/:organization_id/resource_types/' +
  ':resource_type/plans/:plan_id/time/:time/metering_plan/id',
  function*(req) {
    debug(
      'Retrieving metering plan for organization %s, resource type %s and plan %s at time %d',
      req.organization_id, req.params.resource_type, req.params.plan_id, req.params.time);

    // Get the metering plan id
    const id = yield mappings.mappedMeteringPlan(
      yield rtype(req.params.resource_type), req.params.plan_id);
    if(!id)
      return {
        status: 404
      };

    return {
      status: 200,
      body: id
    };
  });

// Return the rating plan id to use for the given resource type, provisioning
// plan at the given time
routes.get(
  '/v1/rating/organizations/:organization_id/resource_types/' +
  ':resource_type/plans/:plan_id/time/:time/rating_plan/id',
  function*(req) {
    debug(
      'Retrieving rating plan for resource type %s and plan %s at time %d',
      req.params.resource_type, req.params.plan_id, req.params.time);

    // Lookup the rating plan id
    const id = yield mappings.mappedRatingPlan(
      yield rtype(req.params.resource_type), req.params.plan_id);
    if(!id)
      return {
        status: 404
      };
    return {
      status: 200,
      body: id
    };
  });

// Return the pricing plan to use for the given resource type, provisioning
// plan at the given time
routes.get(
  '/v1/pricing/organizations/:organization_id/resource_types/' +
  ':resource_type/plans/:plan_id/time/:time/pricing_plan/id',
  function*(req) {
    debug(
      'Retrieving pricing plan for resource type %s and plan %s at time %d',
      req.params.resource_type, req.params.plan_id, req.params.time);

    // Lookup the pricing plan id
    const id = yield mappings.mappedPricingPlan(
      yield rtype(req.params.resource_type), req.params.plan_id);
    if(!id)
      return {
        status: 404
      };

    return {
      status: 200,
      body: id
    };
  });


// Create an account plugin app
const startApp = (port) => {
  // Create the Webapp
  const app = webapp();

  // Secure accounts, orgs, pricing and batch routes using an OAuth
  // bearer access token
  if(secured())
    app.use(/^\/v1\/(accounts|organizations|pricing|rating)|^\/batch$/,
      oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  app.use(routes);
  app.use(router.batch(app));

  if (accountBackend)
    accountBackendToken.start((err) => {
      if (err) {
        edebug('Cannot obtain account backend token due to %o', err);
        throw err;
      }
    });
  return app.listen(port);
};

// Command line interface, create the app and listen
const runCLI = () => startApp();

// Export our public functions
module.exports = startApp;
module.exports.runCLI = runCLI;
