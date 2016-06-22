'use strict';

// Provides access to metering plans.

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
const map = _.map;

const brequest = retry(breaker(batch(request)));

// Setup debug log
const debug = require('abacus-debug')('abacus-metering-config');
const edebug = require('abacus-debug')('e-abacus-metering-config');

// Setup the set of global objects to pass to eval
const context = { BigNumber: BigNumber };

// Resolve service URIs
const uris = urienv({
  provisioning: 9880,
  account: 9881
});

// Default metering and aggregation functions
const meter = (name) => (m) => m[name];
const accumulate = (a, qty, start, end, from, to, twCell) =>
  end < from || end >= to ? null :
  new BigNumber(a || 0).add(qty).toNumber();
const aggregate = (a, prev, curr, aggTwCell, accTwCell) => new BigNumber(
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

// Compile the configured metering functions
const compile = (mc) => {
  return extend({}, mc, {
    source: mc,
    metrics: map(mc.metrics, (t) => {
      return extend({}, t, {
        meterfn: meterfn(t),
        accumulatefn: accumulatefn(t),
        aggregatefn: aggregatefn(t),
        summarizefn: summarizefn(t)
      });
    })
  });
};

// Maintain a cache of metering plans
const plans = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a metering plan
const cache = (k, mp) => {
  plans.set(k, mp);
  return mp;
};

// Return a metering plan from the cache
const cached = (k) => plans.get(k);

// Maintain a cache of metering plan ids
const ids = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a metering plan id
const cacheId = (k, id) => {
  ids.set(k, id);
  return id;
};

// Return a metering plan from the cache
const cachedId = (k) => ids.get(k);

// Business response object
const error = (err, reason) => ({
  error: err,
  reason: reason
});

// Retrieve the metering plan id applicable to the specified organization,
// resource type, provisioning plan and time
const id = (oid, rtype, ppid, time, auth, cb) => {
  debug('Retrieving metering plan_id');
  // Round time to a 10 min boundary
  const t = Math.floor(time / 600000) * 600000;
  const k = [oid, rtype, ppid, t].join('/');

  // Look in our cache first
  const c = cachedId(k);
  if(c) {
    debug('Metering plan id for %s found in cache', k);
    return cb(undefined, {
      metering_plan_id: c
    });
  }

  // Lookup and cache test plans
  if(rtype === 'test-resource')
    return cb(undefined, {
      metering_plan_id: cacheId(k, require('./test/test-metering-plan').plan_id)
    });

  // Forward authorization header field to provisioning plugin
  const o = auth ? { headers: { authorization: auth } } : {};

  // Get metering plan from account plugin
  return brequest.get(uris.account +
    '/v1/metering/organizations/:organization_id/resource_types/' +
    ':resource_type/plans/:plan_id/time/:time/metering_plan/id',
    extend({}, o, {
      organization_id: oid,
      resource_type: rtype,
      plan_id: ppid,
      time: time
    }), (err, val) => {
      if(err)
        return cb(err);

      // Unable to retrieve metering configuration
      if (val.statusCode !== 200) {
        edebug('Unable to retrieve metering plan id, %d - %o',
          val.statusCode, val.body || '');
        debug('Unable to retrieve metering plan id, %d - %o',
          val.statusCode, val.body || '');

        // Response back with description of the error.
        return cb(undefined, error('empidnotfound', 
          'Unable to find metering plan id for resource type ' + rtype +
            ' and plan id ' + ppid));
      }

      // return the metering plan id
      return cb(undefined, {
        metering_plan_id: cacheId(k, val.body)
      });
    });
};

// Retrieve the specified metering plan
const plan = (mpid, auth, cb) => {
  lock(mpid, (err, unlock) => {
    if(err)
      return unlock(cb(err));
    debug('Retrieving metering plan %s', mpid);

    // Look in our cache first
    const c = cached(mpid);
    if(c) {
      debug('Metering plan %s found in cache', mpid);
      return unlock(cb(undefined, {
        metering_plan: c
      }));
    }

    // Lookup and cache test plans
    if(mpid.indexOf('test-metering-plan') !== -1)
      return unlock(
        cb(undefined, {
          metering_plan: cache(mpid, compile(require('./test/' + mpid)))
        }));

    // Forward authorization header field to provisioning plugin
    const o = auth ? { headers: { authorization: auth } } : {};

    // Get the requested metering plan from the provisioning plugin
    return brequest.get(uris.provisioning +
      '/v1/metering/plans/:metering_plan_id', extend(o, {
        metering_plan_id: mpid
      }), (err, val) => {
        if(err)
          return unlock(cb(err));

        // Authorization failed. Unable to retrieve metering plan
        if (val.statusCode !== 200) {
          edebug('Unable to retrieve metering plan, %d - %o',
            val.statusCode, val.body || '');
          debug('Unable to retrieve metering plan, %d - %o',
            val.statusCode, val.body || '');

          // Throw response object as an exception to stop further processing.
          return unlock(cb(undefined, error('emplannotfound',
            'Metering plan for the metering plan id ' + mpid +
              ' is not found')));
        }

        // Compile and return the metering plan
        return unlock(
          cb(undefined, {
            metering_plan: cache(mpid, compile(val.body))
          }));
      });
  });
};

// Export our public functions
module.exports = plan;
module.exports.plan = plan;
module.exports.id = id;
