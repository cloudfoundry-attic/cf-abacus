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
const lru = require('abacus-lrucache');

// BigNumber
const BigNumber = require('bignumber.js');
BigNumber.config({ ERRORS: false });

const formula = require('./formula.js');

const extend = _.extend;
const pick = _.pick;
const map = _.map;

const brequest = retry(breaker(batch(request)));

// Setup debug log
const debug = require('abacus-debug')('abacus-resource-config');
const edebug = require('abacus-debug')('e-abacus-resource-config');

// Setup the set of global objects to pass to eval
const context = { BigNumber: BigNumber };

// Resolve service URIs
const uris = urienv({
  provisioning: 9880
});

// Default metering and aggregation functions
const meter = (name) => (m) => m[name];
const accumulate = (a, qty) => new BigNumber(a || 0).add(qty).toNumber();
const aggregate = (a, prev, curr) => new BigNumber(a || 0)
  .add(curr).sub(prev).toNumber();
const rate = (p, qty) => new BigNumber(p || 0).mul(qty).toNumber();
const charge = (t, cost) => cost ? cost : 0;
const summarize = (t, qty) => qty ? qty : 0;

// Return the meter function for a given metric
const meterfn = (t) => t.meter ? xeval(t.meter, context) :
  t.formula ? formula.meterfn(t.formula) : meter(t.name);

// Return the accumulation function for a given metric
const accumulatefn = (t) => t.accumulate ? xeval(t.accumulate, context) :
  t.formula ? formula.accumfn(t.formula) : accumulate;

// Return the aggregation function for a given metric
const aggregatefn = (t) => t.aggregate ?
  xeval(t.aggregate, context) : aggregate;

// Return the rating function for a given metric
const ratefn = (t) => t.rate ? xeval(t.rate, context) : rate;

// Return the charge function for a given metric
const chargefn = (t) => t.charge ? xeval(t.charge, context) : charge;

// Return the summary function for a given metric
const summarizefn = (t) => t.summarize ?
  xeval(t.summarize, context) : summarize;

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
  max: 1000,
  maxAge: 1000 * 60 * 20
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
const config = (rid, time, auth, cb) => {
  // Round time to a 10 min boundary
  const t = Math.floor(time / 600000) * 600000;
  const k = [rid, t].join('/');

  lock(k, (err, unlock) => {
    if(err)
      return unlock(cb(err));
    debug('Retrieving config for resource %s effective %d', rid, t);

    // Look in our cache first
    const c = cached(k);
    if(c) {
      debug('Config for resource %s effective %d found in cache', rid, t);
      return unlock(cb(undefined, c));
    }

    if(rid === 'test-resource')
      return unlock(
        cb(undefined, cache(k, compile(require('./test/test-resource')))));

    // Forward authorization header field to provisioning
    const o = auth ? { headers: { authorization: auth } } : {};

    // Get the requested resource config from the config service
    return brequest.get(uris.provisioning +
      '/v1/provisioning/resources/:resource_id/config/:time', extend(o, {
        resource_id: rid,
        time: t
      }), (err, val) => {
        if(err)
          return unlock(cb(err));

        // Authorization failed. Unable to retrieve resource configuration
        // for the given time
        if (val.statusCode !== 200) {
          edebug('Unable to retrieve resource configuration, %d - %o',
            val.statusCode, val.body || '');
          debug('Unable to retrieve resource configuration, %d - %o',
            val.statusCode, val.body || '');

          // Unlock and throw response object as an exception
          // to stop further processing
          return unlock(cb(extend({}, pick(val, ['statusCode', 'body']),
            { headers: pick(val.headers, 'www-authenticate') })));
        }

        // Compile and return the config
        return unlock(
          cb(undefined, cache(k, compile(val.body))));
      });
  });
};

// Export our public functions
module.exports = config;

