'use strict';

// Provides access to resource pricing configuration.

const request = require('abacus-request');
const breaker = require('abacus-breaker');
const retry = require('abacus-retry');
const batch = require('abacus-batch');
const urienv = require('abacus-urienv');
const lock = require('abacus-lock');

const brequest = retry(breaker(batch(request)));

// Setup debug log
const debug = require('abacus-debug')('abacus-price-config');

// Resolve service URIs
const uris = urienv({
  account: 9381
});

// Maintain a cache of resource prices
const configs = {};

// Cache a resource price config
const cache = (resource) => {
  configs[[resource.resource_id].join('/')] = resource;
  return resource;
};

// Return a resource price config from the cache
const cached = (rid, time) => {
  return configs[[rid].join('/')];
};

// Retrieve the price config for the specified resource
const config = (rid, time, cb) => {
  lock(rid, (err, unlock) => {
    if(err)
      return unlock(cb(err));

    debug('Retrieving price config for resource %s effective %d', rid, time);
    // Look in our cache first
    const c = cached(rid, time);
    if(c)
      return unlock(cb(undefined, c));

    if(rid === 'test-resource')
      return unlock(
        cb(undefined, cache(require('./test/test-resource'))));

    // Get the requested resource price config from the account service
    return brequest.get(uris.account +
      '/v1/pricing/resources/:resource_id/config/:time', {
        resource_id: rid,
        time: time
      }, (err, val) => {
        if(err)
          return cb(err);

        // Return the price config
        return unlock(cb(undefined, cache(val.body)));
      });
  });
};

// Export our public functions
module.exports = config;

