'use strict';

// Provides access to pricing plans.

const _ = require('underscore');
const request = require('abacus-request');
const breaker = require('abacus-breaker');
const retry = require('abacus-retry');
const batch = require('abacus-batch');
const urienv = require('abacus-urienv');
const lock = require('abacus-lock');
const lru = require('abacus-lrucache');

const extend = _.extend;
const map = _.map;
const filter = _.filter;

const brequest = retry(breaker(batch(request)));

// Setup debug log
const debug = require('abacus-debug')('abacus-pricing-config');
const edebug = require('abacus-debug')('e-abacus-pricing-config');

// Resolve service URIs
const uris = urienv({
  provisioning: 9880,
  account: 9881
});

// Maintain a cache of pricing plans
const plans = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a pricing plan
const cache = (k, p) => {
  plans.set(k, p);
  return p;
};

// Return a pricing plan from the cache
const cached = (k) => {
  return plans.get(k);
};

// Return the prices from a pricing plan for the given country
const countryPrices = (plan, country) => {
  // find price for each specified metrics
  return extend({}, {
    metrics: map(plan.metrics, (m) => {
      // Use the prices for the specified country, default to 0
      const cp = filter(m.prices, (p) => p.country === country);
      return {
        name: m.name,
        price: cp.length ? cp[0].price : 0
      };
    })
  });
};

// Business response object
const error = (err, reason) => ({
  error: err,
  reason: reason
});

// Retrieve the specified pricing plan
const plan = (ppid, country, auth, cb) => {
  debug('Retrieving pricing plan %s', ppid);

  return lock(ppid, (err, unlock) => {
    if(err)
      return unlock(cb(err));

    // Look in our cache first
    const c = cached(ppid);
    if(c) {
      debug('Pricing plan %s found in cache', ppid);
      return unlock(cb(undefined, {
        pricing_plan: countryPrices(c, country)
      }));
    }

    // Lookup and cache test plans
    if(ppid === 'test-pricing-basic' || ppid === 'test-pricing-standard')
      return unlock(
        cb(undefined, {
          pricing_plan: countryPrices(cache (ppid, require('./test/' + ppid)),
            country)
        }));

    // Forward authorization header field to the account plugin
    const o = auth ? { headers: { authorization: auth } } : {};

    // Get the requested pricing plan from the account plugin
    return brequest.get(uris.provisioning +
      '/v1/pricing/plans/:pricing_plan_id', extend(o, {
        pricing_plan_id: ppid
      }), (err, val) => {
        if(err)
          return unlock(cb(err));

        // Unable to retrieve pricing plan
        if (val.statusCode !== 200) {
          edebug('Unable to retrieve pricing plan, %d - %o',
            val.statusCode, val.body || '');
          debug('Unable to retrieve pricing plan, %d - %o',
            val.statusCode, val.body || '');

          // Unlock and throw response object as an exception
          // to stop further processing
          return unlock(cb(undefined, error('epplannotfound',
            'Pricing plan for the pricing plan id ' + ppid + ' is not found'
          )));
        }

        // Return the pricing plan
        return unlock(cb(undefined, {
          pricing_plan: countryPrices(cache(ppid, val.body), country)
        }));
      });
  });
};

// Maintain a cache of pricing plan ids
const ids = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a pricing plan id
const cacheId = (k, id) => {
  ids.set(k, id);
  return id;
};

// Return a pricing plan id from the cache
const cachedId = (k) => ids.get(k);

// Retrieve the pricing plan id applicable to the given org, resource type,
// provisioning plan, and time
const id = (oid, rtype, ppid, time, auth, cb) => {
  debug('Retrieving pricing plan id');

  // Round time to a 10 min boundary
  const t = Math.floor(time / 600000) * 600000;
  const k = [oid, rtype, ppid, t].join('/');

  // Look in our cache first
  const c = cachedId(k);
  if(c) {
    debug('Pricing plan id for %s found in cache', k);
    return cb(undefined, {
      pricing_plan_id: c
    });
  }

  // Lookup and cache test plans
  if(rtype === 'test-resource')
    return cb(undefined, {
      pricing_plan_id: cacheId(k,require('./test/test-pricing-basic').plan_id)
    });

  // Forward authorization header field to the account plugin
  const o = auth ? { headers: { authorization: auth } } : {};

  // Get pricing plan id from the account plugin
  return brequest.get(uris.account +
    '/v1/pricing/organizations/:organization_id/resource_types/' +
    ':resource_type/plans/:plan_id/time/:time/pricing_plan/id',
    extend({}, o, {
      organization_id: oid,
      resource_type: rtype,
      plan_id: ppid,
      time: time
    }), (err, val) => {
      if(err)
        return cb(err);

      // Authorization failed. Unable to retrieve pricing configuration
      if (val.statusCode !== 200) {
        edebug('Unable to retrieve pricing plan id, %d - %o',
          val.statusCode, val.body || '');
        debug('Unable to retrieve pricing plan id, %d - %o',
          val.statusCode, val.body || '');

        // Throw response object as an exception to stop further processing.
        return cb(undefined, error('eppidnotfound',
          'Unable to find pricing plan id for resource type ' + rtype +
            ' and plan id ' + ppid));
      }

      // Return the pricing plan id
      return cb(undefined, {
        pricing_plan_id: cacheId(k, val.body)
      });
    });
};

// Export our public functions
module.exports = plan;
module.exports.plan = plan;
module.exports.id = id;
