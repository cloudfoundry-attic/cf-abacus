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

// Resolve service URIs
const uris = urienv({
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

// Retrieve the specified pricing plan
const plan = (ppid, auth, cb) => {
  lock(ppid, (err, unlock) => {
    if(err)
      return unlock(cb(err));
    debug('Retrieving pricing plan %s', ppid);

    // Look in our cache first
    const c = cached(ppid);
    if(c) {
      debug('Pricing plan %s found in cache', ppid);
      return unlock(cb(undefined, c));
    }

    // Lookup and cache test plans
    if(ppid === 'test-pricing-basic' || ppid === 'test-pricing-standard')
      return unlock(
        cb(undefined, cache(ppid, require('./test/' + ppid))));

    // Forward authorization header field to the account plugin
    const o = auth ? { headers: { authorization: auth } } : {};

    // Get the requested pricing plan from the account plugin
    return brequest.get(uris.account +
      '/v1/pricing/plans/:pricing_plan_id/config', extend(o, {
        pricing_plan_id: ppid
      }), (err, val) => {
        if(err)
          return cb(err);

        // Return the pricing plan
        return unlock(cb(undefined, cache(ppid, val.body)));
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

// Return the prices from a pricing plan for the given country
const prices = (plan, country) => {
  // find price for each specified metrics
  return extend({}, plan, {
    pricing_metrics: map(plan.pricing_metrics, (m) => {
      // Use the prices for the specified country, default to 0
      const cp = filter(m.prices, (p) => p.country === country);
      return {
        name: m.name,
        price: cp.length ? cp[0].price : 0
      };
    })
  });
};

// Retrieve the pricing plan id applicable to the given org, resource type,
// provisioning plan, country and time
const id = (oid, rtype, ppid, country, time, auth, cb) => {
  debug('Retrieving pricing plan id');

  // Round time to a 10 min boundary
  const t = Math.floor(time / 600000) * 600000;
  const k = [oid, rtype, ppid, country, t].join('/');

  // Look in our cache first
  const c = cachedId(k);
  if(c) {
    debug('Pricing plan id for %s found in cache',
      k);
    return cb(undefined, c);
  }

  // Lookup and cache test plans
  if(rtype === 'test-resource')
    return cb(undefined, cacheId(k,
      prices(require('./test/test-pricing-basic'), country)));

  // Forward authorization header field to the account plugin
  const o = auth ? { headers: { authorization: auth } } : {};

  // Get pricing plan id from the account plugin
  return brequest.get(uris.account +
    '/v1/pricing/organizations/:organization_id/resource_types/' +
    ':resource_type/plans/:plan_id/pricing_countries/' +
    ':pricing_country/time/:time/pricing_plan/id',
    extend({}, o, {
      organization_id: oid,
      resource_type: rtype,
      plan_id: ppid,
      pricing_contry: country,
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
        throw res;
      }

      // Return the pricing plan id and prices for the specified country
      return cb(undefined, cacheId(k, prices(val.body, country)));
    });
};

// Export our public functions
module.exports = plan;
module.exports.plan = plan;
module.exports.id = id;
