'use strict';

// Provides access to resource metering and aggregation configuration.

const _ = require('underscore');
const xeval = require('abacus-eval');
const request = require('abacus-request');
const breaker = require('abacus-breaker');
const retry = require('abacus-retry');
const batch = require('abacus-batch');
const urienv = require('abacus-urienv');
const lock = require('abacus-lock');
const lru = require('lru-cache');

const formula = require('./formula.js');

const extend = _.extend;
const map = _.map;

const brequest = retry(breaker(batch(request)));

// Setup debug log
const debug = require('abacus-debug')('abacus-resource-config');

// Resolve service URIs
const uris = urienv({
  provisioning: 9380
});

// Default metering and aggregation functions
const meter = (name) => (m) => m[name];
const accumulate = (a, qty) => (a || 0) + qty;
const aggregate = (a, prev, curr) => (a || 0) + curr - prev;
const rate = (p, qty) => (p || 0) * qty;
const charge = (t, cost) => cost;
const summarize = (t, qty) => qty;

// Return the meter function for a given metric
const meterfn = (t) => t.meter ? xeval(t.meter) :
  t.formula ? formula.meterfn(t.formula) : meter(t.name);

// Return the accumulation function for a given metric
const accumulatefn = (t) => t.accumulate ? xeval(t.accumulate) :
  t.formula ? formula.accumfn(t.formula) : accumulate;

// Return the aggregation function for a given metric
const aggregatefn = (t) => t.aggregate ? xeval(t.aggregate) : aggregate;

// Return the rating function for a given metric
const ratefn = (t) => t.rate ? xeval(t.rate) : rate;

// Return the charge function for a given metric
const chargefn = (t) => t.charge ? xeval(t.charge) : charge;

// Return the summary function for a given metric
const summarizefn = (t) => t.summarize ? xeval(t.summarize) : summarize;

// Compile the functions configured in a resource
const compile = (resource) => {
  return extend({}, resource, {
    source: resource,
    metrics: map(resource.metrics, (t) => {
      return extend({}, t, {
        meterfn: meterfn(t),
        accumulatefn: accumulatefn(t),
        aggregatefn: aggregatefn(t),
        ratefn: ratefn(t),
        chargefn: chargefn(t),
        summarizefn: summarizefn(t)
      });
    })
  });
};

// Maintain a cache of resource configs
const configs = lru({
  max: 20000,
  length: (n) => 1,
  dispose: (key, n) => {
  },
  maxAge: 1000 * 3600 * 24
});

// Cache a resource config
const cache = (k, resource) => {
  configs.set(k, resource);
  return resource;
};

// Return a resource config from the cache
const cached = (k) => {
  return configs.get(k);
};

// Retrieve the configuration for the specified resource and time
const config = (rid, time, cb) => {
  // Round time to a 10 min boundary
  const t = Math.floor(time / 600000) * 600000;
  const k = [rid, t].join('/');

  lock(k, (err, unlock) => {
    if(err)
      return unlock(cb(err));
    debug('Retrieving config for resource %s effective %d', rid, t);

    // Look in our cache first
    const c = cached(k);
    if(c)
      return unlock(cb(undefined, c));

    if(rid === 'test-resource')
      return unlock(
        cb(undefined, cache(k, compile(require('./test/test-resource')))));

    // Get the requested resource config from the config service
    return brequest.get(uris.provisioning +
      '/v1/provisioning/resources/:resource_id/config/:time', {
        resource_id: rid,
        time: t
      }, (err, val) => {
        if(err)
          return cb(err);
        
        // Compile and return the config
        return unlock(
          cb(undefined, cache(k, compile(val.body))));
      });
  });
};

// Export our public functions
module.exports = config;

