'use strict';

// Stub for an account management service. An account is a collection of
// organizations managed by a single billing entity. Usage is aggregated at the
// account level (in addition to organization level) to provide billing systems
// with the usage data they need for billing.

const _ = require('underscore');
const webapp = require('abacus-webapp');
const router = require('abacus-router');
const oauth = require('abacus-oauth');
const schemas = require('abacus-usage-schemas');

const extend = _.extend;
const pick = _.pick;
const map = _.map;
const filter = _.filter;

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

const pricingPlans = {
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
  }
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
routes.get('/v1/orgs/:org_id/account/:time', function *(req) {
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

// Lookup the pricing_country of an organization
const getCountry = (oid) => pick(fake, 'pricing_country').pricing_country;

// Lookup the pricing_plan_id
const pricingConfig = (oid, rid, rt, pid, time) => {
  // In this stub, the pricing_plan_id is obtained by a simple object mapping
  return pricingPlans[rid] ? pricingPlans[rid][pid] : undefined;
}

// Validates the organization_id, resource_id, plan_id,
// resource_type, and time. Returns the pricing_plan_id.
routes.get(
  '/v1/pricing/orgs/:organization_id/resources/:resource_id/types/' +
  ':resource_type/plans/:plan_id/:time', function *(req) {
  debug('Retrieving resource price config %s and the pricing plan id' +
    'at time %d', req.params.resource_id, req.params.time);

  // Get the pricing_plan_id. This is a stub so we just do a simple mapping
  // to find the rating_plan_id
  const pid = pricingConfig(req.params.organization_id, req.params.resource_id,
    req.params.resource_type, req.params.plan_id, req.params.time);
  if (!pid)
    return {
      status: 404
    }

  const country = getCountry(req.params.organization_id);
  const conf = config(req.params.resource_id, parseInt(req.params.time));

  // Need further discussion on the price schema that will be attached to
  // the usage document. Currently stub will returns:
  // prices: [{
  //   name: 'sample',
  //   price: 0
  // }]
  let prices = 0;
  if (conf) {
    const plan = filter(conf.plans, (p) => p.plan_id === req.params.plan_id);
    if (plan.length)
      prices = map(plan[0].metrics, (m) => {
        const cp = filter(m.prices, (p) => p.country === country);
        return {
          name: m.name,
          price: cp.length ? cp[0].price : 0
        }
      });
  }

  return {
    status: 200,
    body: {
      pricing_plan_id: pid,
      prices: prices
    }
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
