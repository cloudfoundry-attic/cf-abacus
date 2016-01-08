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

const brequest = retry(breaker(batch(request)));

// Setup debug log
const debug = require('abacus-debug')('abacus-price-config');

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
const config = (rid, time, auth, cb) => {
  // Round time to a 10 min boundary
  const t = Math.floor(time / 600000) * 600000;
  const k = [rid, t].join('/');

  lock(k, (err, unlock) => {
    if(err)
      return unlock(cb(err));
    debug('Retrieving price config for resource %s effective %d', rid, t);

    // Look in our cache first
    const c = cached(k);
    if(c) {
      debug('Price config for resource %s effective %d found in cache',
        rid, t);
      return unlock(cb(undefined, c));
    }

    if(rid === 'test-resource')
      return unlock(
        cb(undefined, cache(k, require('./test/test-resource'))));

    // Forward authorization header field to account
    const o = auth ? { headers: { authorization: auth } } : {};

    // Get the requested resource price config from the account service
    return brequest.get(uris.account +
      '/v1/pricing/resources/:resource_id/config/:time', extend(o, {
        resource_id: rid,
        time: t
      }), (err, val) => {
        if(err)
          return cb(err);

        // Return the price config
        return unlock(cb(undefined, cache(k, val.body)));
      });
  });
};

// Retrieve the price config for the specified resource and time
const configV2 = (rid, time, pid, auth, cb) => {
  // Round time to a 10 min boundary
  const t = Math.floor(time / 600000) * 600000;
  const k = [rid, pid, t].join('/');

  lock(k, (err, unlock) => {
    if(err)
      return unlock(cb(err));
    debug('Retrieving price config for resource %s with price id %s ' +
      'effective %d', rid, pid, t);

    // Look in our cache first
    const c = cached(k);
    if(c) {
      debug('Price config for resource %s with price id %s effective %d ' +
        'found in cache', rid, pid, t);
      return unlock(cb(undefined, c));
    }

    if(rid === 'test-resource')
      return unlock(
        cb(undefined, cache(k, require('./test/test-resource-' + pid))));

    // Forward authorization header field to account
    const o = auth ? { headers: { authorization: auth } } : {};

    // Get the requested resource price config from the account service
    return brequest.get(uris.account +
      '/v2/pricing/resources/:resource_id/prices/:price_id/config/:time',
      extend(o, {
        resource_id: rid,
        price_id: pid,
        time: t
      }), (err, val) => {
        if(err)
          return cb(err);

        // Return the price config
        return unlock(cb(undefined, cache(k, val.body)));
      });
  });
};

// Export our public functions
module.exports = config;
module.exports.configV2 = configV2
