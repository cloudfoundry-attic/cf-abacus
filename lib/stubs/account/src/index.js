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
const dbclient = require('abacus-dbclient');
const partition = require('abacus-partition');
const lockcb = require('abacus-lock');
const urienv = require('abacus-urienv');
const retry = require('abacus-retry');
const batch = require('abacus-batch');
const breaker = require('abacus-breaker');
const yieldable = require('abacus-yieldable');
const lru = require('abacus-lrucache');

const extend = _.extend;
const pick = _.pick;
const map = _.map;
const filter = _.filter;

const rlock = yieldable(lockcb);
const plock = yieldable(lockcb);

/* jshint noyield: true */

// Setup debug log
const debug = require('abacus-debug')('abacus-account-stub');

// Secure the routes or not
const secured = () => process.env.SECURED === 'true' ? true : false;

const uris = urienv({
  couchdb: 5984
});

// Configure rating config db
const ratingdb = yieldable(retry(breaker(batch(
  dbclient(partition.singleton,
  dbclient.dburi(uris.couchdb, 'abacus-rating-config'))))));

// Configure pricing config db
const pricingdb = yieldable(retry(breaker(batch(
  dbclient(partition.singleton,
  dbclient.dburi(uris.couchdb, 'abacus-pricing-config'))))));

// Create an express router
const routes = router();

// Store a new pricing config
const newpConfig = function *(ppid, conf) {
  schemas.pricingConfig.validate(conf);
  debug('Storing new pricing config with id %s', ppid);
  const id = ['k', ppid].join('/');
  yield pricingdb.put(extend({}, conf, {
    _id: id
  }));
};

// Maintain a cache of pricing configs
const pconfigs = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a rating config
const pcache = (k, pricing) => {
  pconfigs.set(k, pricing);
  return pricing;
};

// Return a pricing config from the cache
const pcached = (k) => pconfigs.get(k);

// Store a new rating config
const newrConfig = function *(rpid, conf) {
  schemas.ratingConfig.validate(conf);
  debug('Storing new rating config with id %s', rpid);
  const id = ['k', rpid].join('/');
  yield ratingdb.put(extend({}, conf, {
    _id: id
  }));
};

// Maintain a cache of rating configs
const rconfigs = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a rating config
const rcache = (k, rating) => {
  rconfigs.set(k, rating);
  return rating;
};

// Return a rating config from the cache
const rcached = (k) => rconfigs.get(k);

// The fake test account returned by the stub
const fake = {
  account_id: '1234',
  organizations: [
    'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
    'b3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
    'c3d7fe4d-3cb1-4cc3-a831-ffe98e20cf29'],
  pricing_country: 'USA'
};

// Contains mapping for pricing_plan_id. pricingPlans[resource_id][plan_id]
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
  },
  'test-db': {
    basic: 'test-db-basic'
  }
};

// Contains mapping of rating_plan_id. ratingPlans[resource_id][plan_id]
const ratingPlans = {
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
    basic: 'basic-test-rating-plan',
    standard: 'standard-test-rating-plan'
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
const pricingId = (rid, pid) => {
  // In this stub, the pricing_plan_id is obtained by a simple object mapping
  return pricingPlans[rid] ? pricingPlans[rid][pid] : undefined;
}

// Load and return a pricing config. Search in local directory first,
// then in the rating config database.
const pconfig = function *(ppid) {
  const unlock = yield plock(ppid);
  const id = ['k'. ppid].join('/');
  try {
    debug('Retrieving pricing config for pricing plan id %s', ppid);

    // Look in cache
    const cc = pcached(id);
    if(cc) {
      debug('Pricing config %s found in cache', ppid);
      return cc;
    }
    // Look in the local pricing-config dir
    try {
      return schemas.pricingConfig.validate(
        require('./pricing-configs/' + ppid));
    }
    catch(e) {
    }
    debug('No pricing config %s found in local resources', ppid);

    // Look in the pricing database
    const doc = yield pricingdb.get(id);
    return doc ? pcache(id, dbclient.undbify(doc)) : doc;
  }
  finally {
    unlock();
  }
};

// Filter the pricing config to return metric prices for
// the org's pricing country
const filterByCountry = (conf, country) => {
  // find price for each specified metrics
  return extend({}, conf, {
    pricing_metrics: map(conf.pricing_metrics, (m) => {
      // Use the configured pricing for the specified country, default to 0
      const cp = filter(m.prices, (p) => p.country === country);
      return {
        name: m.name,
        price: cp.length ? cp[0].price : 0
      };
    })
  });
};

// Validates the organization_id, resource_id, plan_id,
// resource_type, and time. Returns the pricing_plan_id.
routes.get(
  '/v1/pricing/orgs/:organization_id/resources/:resource_id/types/' +
  ':resource_type/plans/:plan_id/:time', function *(req) {
  debug('Retrieving resource price config %s and the pricing plan id' +
    'at time %d', req.params.resource_id, req.params.time);

  // Get the pricing_plan_id. This is a stub so we just do a simple mapping
  // to find the rating_plan_id
  const ppid = pricingId(req.params.resource_id, req.params.plan_id);

  if (!ppid)
    return {
      status: 404
    };

  const conf = yield pconfig(ppid);

  if(!conf)
    return {
      status: 404
    };

  const country = getCountry(req.params.organization_id);

  // Will need to do schema check, once we finalize the format
  return {
    status: 200,
    body: filterByCountry(conf, country)
  };
});

// Lookup the rating_plan_id
const ratingId = (rid, pid) => {
  // In this stub, the rating plan id is obtained by a simple object mapping
  return ratingPlans[rid] ? ratingPlans[rid][pid] : undefined;
}

// Load and return a rating config. Search in local directory first,
// then in the rating config database.
const rconfig = function *(rpid) {
  const unlock = yield rlock(rpid);
  const id = ['k', rpid].join('/');
  try {
    debug('Retrieving rating config for rating plan id %s', rpid);

    // Look in cache
    const cc = rcached(id);
    if(cc) {
      debug('Rating config %s found in cache', rpid);
      return cc;
    }
    // Look in the local rating-config dir
    try {
      return schemas.ratingConfig.validate(
        require('./rating-configs/' + rpid));
    }
    catch(e) {
    }
    debug('No rating config %s found in local resources', rpid);

    // Look in the rating database
    const doc = yield ratingdb.get(id);
    return doc ? rcache(id, dbclient.undbify(doc)) : doc;
  }
  finally {
    unlock();
  }
};

// Validate the rating configuration given the organization_id,
// resource_id, plan_id, resource_type, and time. Returns the
// rating_plan_id. 
routes.get(
  '/v1/rating/orgs/:organization_id/resources/:resource_id/types/' +
  ':resource_type/plans/:plan_id/:time', function *(req) {
  debug('Retrieving rating config %s at time %d',
    req.params.resource_id, req.params.time);

  // Get the rating_plan_id. This is a stub so we just do a simple mapping
  // to find the rating_plan_id.
  const rpid = ratingId(req.params.resource_id, req.params.plan_id);
  if (!rpid)
    return {
      status: 404
    }

  const conf = yield rconfig(rpid);

  if(!conf)
    return {
      status: 404
    };

  return {
    status: 200,
    body: conf
  };
});

// Return the rating configuration for a particular rating_plan_id
routes.get(
  '/v1/rating/plans/:rating_plan_id/config', function *(req) {
    debug('Retrieving rating config %s', req.params.rating_plan_id);

    // This is a stub here so we just return our sample resource price
    // configs
    const conf = yield rconfig(req.params.rating_plan_id);
    if(!conf)
      return {
        status: 404
      };

    // Return the rating config
    return {
      status: 200,
      body: conf
    };
  });

// Store a new rating config to the database
routes.post(
  '/v1/rating/plans/:rating_plan_id/config', function *(req) {
    debug('Storing rating config with rating plan id %s',
      req.params.rating_plan_id);
    yield newrConfig(req.params.rating_plan_id, req.body);
    return {
      status: 204
    };
  });

// Store a new pricing config to the database
routes.post(
  '/v1/pricing/plans/:pricing_plan_id/config', function *(req) {
    debug('Storing pricing config with pricing plan id %s',
      req.params.pricing_plan_id);
    yield newpConfig(req.params.pricing_plan_id, req.body);
    return {
      status: 204
    };
  });

// Create an account info service app
const accounts = () => {
  // Create the Webapp
  const app = webapp();

  // Secure accounts, orgs, pricing and batch routes using an OAuth
  // bearer access token
  if (secured())
    app.use(/^\/v1\/(accounts|orgs|pricing|rating)|^\/batch$/,
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
