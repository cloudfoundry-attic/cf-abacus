'use strict';

// Provides access to resource metering configuration.

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
const debug = require('abacus-debug')('abacus-metering-config');
const edebug = require('abacus-debug')('e-abacus-metering-config');

// Setup the set of global objects to pass to eval
const context = { BigNumber: BigNumber };

// Resolve service URIs
const uris = urienv({
  provisioning: 9880
});

// Default metering and aggregation functions
const meter = (name) => (m) => m[name];
const accumulate = (a, qty) => new BigNumber(a || 0).add(qty).toNumber();
const aggregate = (a, prev, curr) => new BigNumber(
  a || 0).add(curr).sub(prev).toNumber();
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

// Return the summary function for a given metric
const summarizefn = (t) => t.summarize ?
  xeval(t.summarize, context) : summarize;

// Compile the functions configured in a resource
const compile = (resource) => {
  return extend({}, resource, {
    source: resource,
    plans: map(resource.plans, (p) => {
      return extend({}, p, {
        metrics: map(p.metrics, (t) => {
          return extend({}, t, {
            meterfn: meterfn(t),
            accumulatefn: accumulatefn(t),
            aggregatefn: aggregatefn(t),
            summarizefn: summarizefn(t)
          });
        })
      });
    })
  });
};

// Maintain a cache of metering configs
const configs = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a metering config
const cache = (k, mc) => {
  configs.set(k, mc);
  return mc;
};

// Return a metering config from the cache
const cached = (k) => configs.get(k);

// Retrieve the configuration for the specified metering plan
const config = (mpid, auth, cb) => {
  lock(mpid, (err, unlock) => {
    if(err)
      return unlock(cb(err));
    debug('Retrieving config for metering plan %s', mpid);

    // Look in our cache first
    const c = cached(mpid);
    if(c) {
      debug('Config for metering plan %s found in cache', mpid);
      return unlock(cb(undefined, c));
    }

    if(mpid === 'standard-test-metering-plan' ||
      mpid === 'basic-test-metering-plan')
      return unlock(
        cb(undefined, cache(mpid, compile(require('./test/' + mpid)))));

    // Forward authorization header field to provisioning
    const o = auth ? { headers: { authorization: auth } } : {};

    // Get the requested metering config from the config service
    return brequest.get(uris.provisioning +
      '/v1/metering/plans/:metering_plan_id/config', extend(o, {
        metering_plan_id: mpid
      }), (err, val) => {
        if(err)
          return unlock(cb(err));

        // Authorization failed. Unable to retrieve metering configuration
        if (val.statusCode !== 200) {
          edebug('Unable to retrieve metering configuration, %d - %o',
            val.statusCode, val.body || '');
          debug('Unable to retrieve metering configuration, %d - %o',
            val.statusCode, val.body || '');

          // Unlock and throw response object as an exception
          // to stop further processing
          return unlock(cb(extend({}, pick(val, ['statusCode', 'body']),
            { headers: pick(val.headers, 'www-authenticate') })));
        }

        // Compile and return the config
        return unlock(
          cb(undefined, cache(mpid, compile(val.body))));
      });
  });
};

// Export our public functions
module.exports = config;

