'use strict';

// Provides access to resource rating configuration.

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

const extend = _.extend;
const pick = _.pick;
const map = _.map;

const brequest = retry(breaker(batch(request)));

// Setup debug log
const debug = require('abacus-debug')('abacus-rate-config');
const edebug = require('abacus-debug')('e-abacus-rate-config');

// Setup the set of global objects to pass to eval
const context = { BigNumber: BigNumber };

// Resolve service URIs
const uris = urienv({
  account: 9881
});

// Default metering and aggregation functions
const rate = (p, qty) => new BigNumber(p || 0).mul(qty).toNumber();
const charge = (t, cost) => cost ? cost : 0;

// Return the rating function for a given metric
const ratefn = (t) => t.rate ? xeval(t.rate, context) : rate;

// Return the charge function for a given metric
const chargefn = (t) => t.charge ? xeval(t.charge, context) : charge;

// Compile the functions configured in a rate config
const compile = (ratec) => {
  return extend({}, ratec, {
    source: ratec,
    metrics: map(ratec.metrics, (m) => {
      return extend({}, m, {
        ratefn: ratefn(m),
        chargefn: chargefn(m)
      });
    })
  });
};

// Maintain a cache of rate configs
const configs = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a rate config
const cache = (k, ratec) => {
  configs.set(k, ratec);
  return ratec;
};

// Return a resource config from the cache
const cached = (k) => configs.get(k);;

// Retrieve the configuration for the specified resource and time
const config = (rpid, auth, cb) => {
  lock(rpid, (err, unlock) => {
    if(err)
      return unlock(cb(err));
    debug('Retrieving rating config for plan %s', rpid);

    // Look in our cache first
    const c = cached(rpid);
    if(c) {
      debug('Config for rating config %s found in cache', rpid);
      return unlock(cb(undefined, c));
    }

    if(rpid === 'standard-test-rating-plan' ||
      rpid === 'basic-test-rating-plan')
      return unlock(
        cb(undefined, cache(rpid, compile(require('./test/' + rpid)))));

    // Forward authorization header field to account
    const o = auth ? { headers: { authorization: auth } } : {};

    // Get the requested rating config from the config service
    return brequest.get(uris.account +
      '/v1/rating/plans/:rating_plan_id/config', extend(o, {
        rating_plan_id: rpid
      }), (err, val) => {
        if(err)
          return unlock(cb(err));

        // Authorization failed. Unable to retrieve rating configuration
        // for the given time
        if (val.statusCode !== 200) {
          edebug('Unable to retrieve rating configuration, %d - %o',
            val.statusCode, val.body || '');
          debug('Unable to retrieve rating configuration, %d - %o',
            val.statusCode, val.body || '');

          // Unlock and throw response object as an exception
          // to stop further processing
          return unlock(cb(extend({}, pick(val, ['statusCode', 'body']),
            { headers: pick(val.headers, 'www-authenticate') })));
        }

        // Compile and return the rating config
        return unlock(
          cb(undefined, cache(rpid, compile(val.body))));
      });
  });
};

// Export our public functions
module.exports = config;
