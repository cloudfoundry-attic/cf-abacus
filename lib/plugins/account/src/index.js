'use strict';

// Minimal example implementation of an Abacus account management plugin.

// An account is a collection of organizations managed by a single billing
// entity. An account plugin provides REST APIs used by the Abacus usage
// processing pipeline to retrieve information about the account owning an
// organization, and the rating plans and pricing plans which should be used
// to rate resource usage incurred by that organization.

// This minimal Abacus account management plugin example is provided only for
// demo and test purposes. An integrator of Abacus is expected to replace it
// with a real production implementation.

const _ = require('underscore');
const webapp = require('abacus-webapp');
const router = require('abacus-router');
const oauth = require('abacus-oauth');

const extend = _.extend;
/* jshint noyield: true */

// Setup debug log
const debug = require('abacus-debug')('abacus-account-plugin');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

// Create an express router
const routes = router();

// Return the type of a resource
const rtype = function *(rid) {
  // This is just a minimal example implementation, we simply return the
  // given resource id
  return rid;
};

// The example account returned by the plugin
const sampleAccount = {
  account_id: '1234',
  organizations: [
    'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
    'b3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
    'c3d7fe4d-3cb1-4cc3-a831-ffe98e20cf29'],
  pricing_country: 'USA'
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
    basic: 'test-metering-plan',
    standard: 'test-metering-plan'
  }
};

// Map a resource type and provisioning plan id to a metering plan id
const mpid = function *(rtype, pid) {
  return sampleMetering[rtype] ? sampleMetering[rtype][pid] : undefined;
};

// Map from (resource_type, provisioning plan_id) to example rating plan id
const sampleRatings = {
  analytics: {
    basic: 'analytics-rating-plan',
    standard: 'analytics-rating-plan'
  },
  'linux-container': {
    basic: 'linux-rating-plan',
    standard: 'linux-rating-plan'
  },
  'object-storage': {
    basic: 'object-rating-plan',
    standard: 'object-rating-plan'
  },
  'test-resource': {
    basic: 'test-rating-plan',
    standard: 'test-rating-plan-standard'
  }
};

// Map a resource type and provisioning plan id to a rating plan id
const rpid = function *(rt, pid) {
  return sampleRatings[rt] ? sampleRatings[rt][pid] : undefined;
};

// Map from (resource_type, provisioning plan_id) to example pricing plan id
const samplePricings = {
  analytics: {
    basic: 'analytics-pricing-basic',
    standard: 'analytics-pricing-standard'
  },
  'linux-container': {
    basic: 'linux-pricing-basic',
    standard: 'linux-pricing-standard'
  },
  'object-storage': {
    basic: 'object-pricing-basic',
    standard: 'object-pricing-standard'
  },
  'test-resource': {
    basic: 'test-pricing-basic',
    standard: 'test-pricing-standard'
  },
  'test-db': {
    basic: 'test-db-basic'
  }
};

// Map from (organization_id
const testOrgs = {
  test_status_code_502: { status: 502 },
  test_status_code_404: { status: 404 }
};

// Map a resource type and provisioning plan id to a pricing plan id
const ppid = function *(rt, pid) {
  // Return our example pricing plan ids
  return samplePricings[rt] ? samplePricings[rt][pid] : undefined;
};

// Retrieve and return an account
routes.get('/v1/accounts/:account_id', function *(req) {
  debug('Retrieving account %s', req.params.account_id);

  // Always succeed and return our example account
  return {
    status: 200,
    body: extend({}, sampleAccount, {
      account_id: req.params.account_id
    })
  };
});

// Retrieve and return the account owning the given org at the given time
routes.get('/v1/organizations/:org_id/account/:time', function *(req) {
  debug('Retrieving account owning org %s', req.params.org_id);

  // Always succeed and return our example account
  return testOrgs[req.params.org_id] ? testOrgs[req.params.org_id] : {
    status: 200,
    body: extend({}, sampleAccount, {
      organizations: [req.params.org_id]
    })
  };
});

// Return the metering plan id to use for the given resource type, provisioning
// plan at the given time
routes.get(
  '/v1/metering/organizations/:organization_id/resource_types/' +
  ':resource_type/plans/:plan_id/time/:time/metering_plan/id',
  function *(req) {
    debug(
      'Retrieving metering plan for resource type %s and plan %s at time %d',
      req.params.resource_type, req.params.plan_id, req.params.time);

    // Get the metering plan id
    const id = yield mpid(
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
  function *(req) {
    debug(
      'Retrieving rating plan for resource type %s and plan %s at time %d',
      req.params.resource_type, req.params.plan_id, req.params.time);

    // Lookup the rating plan id
    const id = yield rpid(req.params.resource_type, req.params.plan_id);
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
  function *(req) {
    debug(
      'Retrieving pricing plan for resource type %s and plan %s at time %d',
      req.params.resource_type, req.params.plan_id, req.params.time);

    // Lookup the pricing plan id
    const id = yield ppid(req.params.resource_type, req.params.plan_id);
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
const accounts = () => {
  // Create the Webapp
  const app = webapp();

  // Secure accounts, orgs, pricing and batch routes using an OAuth
  // bearer access token
  if(secured())
    app.use(/^\/v1\/(accounts|organizations|pricing|rating)|^\/batch$/,
      oauth.validator(process.env.JWTKEY, process.env.JWTALGO));

  app.use(routes);
  app.use(router.batch(app));

  return app;
};

// Command line interface, create the app and listen
const runCLI = () => accounts().listen();

// Export our public functions
module.exports = accounts;
module.exports.runCLI = runCLI;
