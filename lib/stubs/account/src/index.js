'use strict';

// Stub for an account management service. An account is a collection of
// organizations managed by a single billing entity. Usage is aggregated at the
// account level (in addition to organization level) to provide billing systems
// with the usage data they need for billing.

const _ = require('underscore');
const webapp = require('abacus-webapp');
const router = require('abacus-router');
const oauth = require('abacus-cfoauth');
const schemas = require('abacus-usage-schemas');

const extend = _.extend;

/* jshint noyield: true */

// Setup debug log
const debug = require('abacus-debug')('abacus-account-stub');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

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
    body: extend({}, fake, { account_id: req.params.account_id })
  };
});

// Retrieve and return the account containing the given org
routes.get('/v1/orgs/:org_id/account', function *(req) {
  debug('Retrieving account containing org %s', req.params.org_id);

  // This is a stub here so we always succeed and return our fake account
  return {
    status: 200,
    body: extend({}, fake, { organizations: [req.params.org_id] })
  };
});

// Load and return a resource price config
const config = (rid, time) => {
  try {
    return require('./resources/' + rid);
  }
  catch(e) {
    return undefined;
  }
};

// Return the resource price configuration for a particular resource id and
// effective time (allowing evolution of prices over time, where different
// versions of the price configuration will be used at different
// points in time)
routes.get(
  '/v1/pricing/resources/:resource_id/config/:time', function *(req) {
    debug('Retrieving resource price config %s at time %d',
      req.params.resource_id, req.params.time);

    // This is a stub here so we just return our sample resource price
    // configs
    const conf = config(req.params.resource_id, parseInt(req.params.time));
    if(!conf)
      return {
        status: 404
      };

    // Validate and return the resource price config
    schemas.priceConfig.validate(conf);
    return {
      status: 200,
      body: require('./resources/' + req.params.resource_id)
    };
  });

// Create an account info service app
const accounts = () => {
  // Create the Webapp
  const app = webapp();

  // Secure accounts, orgs, pricing and batch routes using an OAuth
  // bearer access token
  if (secured())
    app.use(/^\/v1\/(accounts|orgs|pricing)|^\/batch$/,
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
