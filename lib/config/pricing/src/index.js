'use strict';

// Provides access to resource pricing configuration.

const _ = require('underscore');
const request = require('abacus-request');
const breaker = require('abacus-breaker');
const retry = require('abacus-retry');
const batch = require('abacus-batch');
const urienv = require('abacus-urienv');
const lock = require('abacus-lock');
const lru = require('abacus-lrucache');

const extend = _.extend;
const pick = _.pick;
const map = _.map;
const filter = _.filter;

const brequest = retry(breaker(batch(request)));

// Setup debug log
const debug = require('abacus-debug')('abacus-pricing-config');

// Resolve service URIs
const uris = urienv({
  account: 9881
});

// Maintain a cache of resource prices
const configs = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a resource price config
const cache = (k, resource) => {
  configs.set(k, resource);
  return resource;
};

// Return a resource price config from the cache
const cached = (k) => {
  return configs.get(k);
};

// Retrieve the price config for the specified resource and time
const config = (ppid, auth, cb) => {
  lock(ppid, (err, unlock) => {
    if(err)
      return unlock(cb(err));
    debug('Retrieving pricing config for plan %s', ppid);

    // Look in our cache first
    const c = cached(ppid);
    if(c) {
      debug('Pricing config for pricing_plan_id %s found in cache',
        ppid);
      return unlock(cb(undefined, c));
    }

    if(ppid === 'test-pricing-basic' || ppid === 'test-pricing-standard')
      return unlock(
        cb(undefined, cache(ppid, require('./test/' + ppid))));

    // Forward authorization header field to account
    const o = auth ? { headers: { authorization: auth } } : {};

    // Get the requested resource price config from the account service
    return brequest.get(uris.account +
      '/v1/pricing/plans/:pricing_plan_id/config', extend(o, {
        pricing_plan_id: ppid
      }), (err, val) => {
        if(err)
          return cb(err);

        // Return the price config
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

// Return a rating config from the cache
const cachedId = (k) => configs.get(k);

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

// Retrieve the pricing_config_id
const configId = (u, o, cb) => {
  debug('Retrieving pricing_plan_id');

  // Round time to a 10 min boundary
  const t = Math.floor(u.time / 600000) * 600000;
  const k = [u.organization_id, u.resource_type, u.plan_id,
    u.pricing_country, t].join('/');

  // Look in our cache first
  const c = cachedId(k);
  if(c) {
    debug('Rating_plan_id for %s found in cache',
      k);
    return cb(undefined, c));
  }

  if(u.resource_type === 'test-resource')
    return cb(undefined, cacheId(k,
      pick(filterByCountry(require('./test/test-pricing-basic'),
        u.pricing_country), 'pricing_plan_id', 'pricing_metrics')));

  // Get rating_plan_id
  return brequest.get(uris.account +
    '/v1/pricing/organizations/:organization_id/resource_types/' +
    ':resource_type/plans/:plan_id/pricing_countries/' +
    ':pricing_country/time/:time/pricing_plan/id',
    extend({}, o, u), (err, val) => {
      if(err)
        return cb(err);

      // Authorization failed. Unable to retrieve rating configuration
      if (val.statusCode !== 200) {
        edebug('Unable to retrieve rating_plan_id, %d - %o',
          val.statusCode, val.body || '');
        debug('Unable to retrieve rating_plan_id, %d - %o',
          val.statusCode, val.body || '');
        
        // Throw response object as an exception to stop further processing.
        throw res;
      }

      // Compile and return the rating config
      return cb(undefined, cacheId(k, pick(val.body, 'pricing_plan_id',
        'pricing_metrics')));
    });
};

// Export our public functions
module.exports = config;
module.exports.configId = configId;
