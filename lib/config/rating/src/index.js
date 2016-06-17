'use strict';

// Provides access to rating plans.

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
const map = _.map;

const brequest = retry(breaker(batch(request)));

// Setup debug log
const debug = require('abacus-debug')('abacus-rating-config');
const edebug = require('abacus-debug')('e-abacus-rating-config');

// Setup the set of global objects to pass to eval
const context = { BigNumber: BigNumber };

// Resolve service URIs
const uris = urienv({
  provisioning: 9880,
  account: 9881
});

// Default rating and charge functions
const rate = (p, qty) => new BigNumber(p || 0).mul(qty).toNumber();
const charge = (t, cost) => cost ? cost : 0;

// Return the rating function for a given metric
const ratefn = (t) => t.rate ? xeval(t.rate, context) : rate;

// Return the charge function for a given metric
const chargefn = (t) => t.charge ? xeval(t.charge, context) : charge;

// Compile the functions configured in a rating plan
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

// Maintain a cache of rating plans
const plans = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a rating plan
const cache = (k, p) => {
  plans.set(k, p);
  return p;
};

// Return a rating plan from the cache
const cached = (k) => plans.get(k);

// Business response object
const error = (err, reason) => ({
  error: err,
  reason: reason
});

// Retrieve the specified rating plan
const plan = (rpid, auth, cb) => {
  lock(rpid, (err, unlock) => {
    if(err)
      return unlock(cb(err));
    debug('Retrieving rating plan %s', rpid);

    // Look in our cache first
    const c = cached(rpid);
    if(c) {
      debug('Rating plan %s found in cache', rpid);
      return unlock(cb(undefined, {
        rating_plan: c
      }));
    }

    // Lookup and cache test plans
    if(rpid.indexOf('test-rating-plan') !== -1)
      return unlock(
        cb(undefined, {
          rating_plan: cache(rpid, compile(require('./test/' + rpid)))
        }));

    // Forward authorization header field to account plugin
    const o = auth ? { headers: { authorization: auth } } : {};

    // Get the requested rating plan from the account plugin
    return brequest.get(uris.provisioning +
      '/v1/rating/plans/:rating_plan_id', extend(o, {
        rating_plan_id: rpid
      }), (err, val) => {
        if(err)
          return unlock(cb(err));

        // Unable to retrieve rating plan
        if (val.statusCode !== 200) {
          edebug('Unable to retrieve rating plan, %d - %o',
            val.statusCode, val.body || '');
          debug('Unable to retrieve rating plan, %d - %o',
            val.statusCode, val.body || '');

          // Throw response object as an exception to stop further processing.
          return unlock(cb(undefined, error('erplannotfound',
            'Rating plan for the rating plan id ' + rpid + ' is not found')));
        }

        // Compile and return the rating config
        return unlock(
          cb(undefined, {
            rating_plan: cache(rpid, compile(val.body))
          }));
      });
  });
};

// Maintain a cache of rating plan ids
const ids = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a rating plan id
const cacheId = (k, id) => {
  ids.set(k, id);
  return id;
};

// Return a rating plan id from the cache
const cachedId = (k) => ids.get(k);

// Retrieve the metering plan id applicable to the specified organization,
// resource type, provisioning plan and time
const id = (oid, rtype, ppid, time, auth, cb) => {
  debug('Retrieving rating plan id');

  // Round time to a 10 min boundary
  const t = Math.floor(time / 600000) * 600000;
  const k = [oid, rtype, ppid, t].join('/');

  // Look in our cache first
  const c = cachedId(k);
  if(c) {
    debug('Rating plan id for %s found in cache', k);
    return cb(undefined, {
      rating_plan_id: c
    });
  }

  // Lookup test plan ids
  if (rtype === 'test-resource')
    return cb(undefined, {
      rating_plan_id: cacheId(k, require('./test/test-rating-plan').plan_id)
    });

  // Forward authorization header field to account plugin
  const o = auth ? { headers: { authorization: auth } } : {};

  // Get rating plan id from account plugin
  return brequest.get(uris.account +
    '/v1/rating/organizations/:organization_id/resource_types/' +
    ':resource_type/plans/:plan_id/time/:time/rating_plan/id',
    extend({}, o, {
      organization_id: oid,
      resource_type: rtype,
      time: time,
      plan_id: ppid
    }), (err, val) => {
      if(err)
        return cb(err);

      // Unable to retrieve rating configuration
      if (val.statusCode !== 200) {
        edebug('Unable to retrieve rating plan id, %d - %o',
          val.statusCode, val.body || '');
        debug('Unable to retrieve rating plan id, %d - %o',
          val.statusCode, val.body || '');

        // Throw response object as an exception to stop further processing.
        return cb(undefined, error('erpidnotfound',
          'Unable to find rating plan id for resource type ' + rtype +
            ' and plan id ' + ppid));;
      }

      // Return the rating plan id
      return cb(undefined, {
        rating_plan_id: cacheId(k, val.body)
      });
    });
};

// Export our public functions
module.exports = plan;
module.exports.plan = plan;
module.exports.id = id;
