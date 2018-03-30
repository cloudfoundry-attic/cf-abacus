'use strict';

// Provides access to pricing plans.

const _ = require('underscore');
const request = require('abacus-request');
const breaker = require('abacus-breaker');
const retry = require('abacus-retry');
const batch = require('abacus-batch');
const urienv = require('abacus-urienv');
const lock = require('abacus-lock').locker('pconfig');
const lru = require('abacus-lrucache');

const extend = _.extend;
const map = _.map;
const filter = _.filter;

const brequest = retry(breaker(batch(request)));

// Setup debug log
const debug = require('abacus-debug')('abacus-pricing-config');
const edebug = require('abacus-debug')('e-abacus-pricing-config');

// Resolve service URIs
const uris = urienv({
  provisioning: 9880,
  account: 9881
});

// Return the configured duration of cache
const maxAge = process.env.PLAN_CACHE_MAX_AGE ? parseInt(process.env.PLAN_CACHE_MAX_AGE) : 1200000;

// Maintain a cache of pricing plans
const plans = lru({
  max: 1000,
  maxAge: maxAge
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

// Return the prices from a pricing plan for the given country
const countryPrices = (plan, country) => {
  // find price for each specified metrics
  return extend(
    {},
    {
      metrics: map(plan.metrics, (m) => {
        // Use the prices for the specified country, default to 0
        const cp = filter(m.prices, (p) => p.country === country);
        return {
          name: m.name,
          price: cp.length ? cp[0].price : 0
        };
      })
    }
  );
};

// Maintain a cache of pricing plan ids
const ids = lru({
  max: 1000,
  maxAge: maxAge
});

// Cache a pricing plan id
const cacheId = (k, id) => {
  ids.set(k, id);
  return id;
};

// Return a pricing plan id from the cache
const cachedId = (k) => ids.get(k);

// Business response object
const error = (err, reason, cause) => ({
  error: err,
  reason: reason,
  cause: cause
});

const ignoreOrganization = process.env.IGNORE_ORGANIZATION === 'true';

// Retrieve the pricing plan id applicable to the given org, resource type,
// provisioning plan, and time
const id = (organizationId, resourceType, provisioningPlanId, time, auth, cb) => {
  // Round time to a 10 min boundary
  const t = Math.floor(time / 600000) * 600000;
  const orgId = ignoreOrganization ? 'unknown' : organizationId;
  const key = [orgId, resourceType, provisioningPlanId, t].join('/');

  debug('Retrieving pricing plan id for %s', key);
  return lock(key, (err, unlock) => {
    if (err) {
      edebug('Error locking pricing id %s: %o', key, err);
      return unlock(cb(err));
    }

    // Look in our cache first
    const c = cachedId(key);
    if (c) {
      debug('Pricing plan id for %s found in cache', key);
      return unlock(
        cb(undefined, {
          pricing_plan_id: c
        })
      );
    }

    // Lookup and cache test plans
    if (resourceType === 'test-resource')
      return unlock(
        cb(undefined, {
          pricing_plan_id: cacheId(key, require('./test/test-pricing-basic').plan_id)
        })
      );

    // Forward authorization header field to the account plugin
    const o = auth ? { headers: { authorization: auth } } : {};

    // Get pricing plan id from the account plugin
    return brequest.get(
      uris.account +
      '/v1/pricing/organizations/:organization_id/resource_types/' +
      ':resource_type/plans/:plan_id/time/:time/pricing_plan/id',
      extend({}, o, {
        organization_id: orgId,
        resource_type: resourceType,
        plan_id: provisioningPlanId,
        time: time
      }),
      (err, val) => {
        if (err) {
          edebug(`Error retrieving pricing plan id for resource type ${resourceType}` +
            ` and plan id ${provisioningPlanId}, error: %o`, err);
          return unlock(cb(err));
        }

        // Authorization failed. Unable to retrieve pricing configuration
        if (val.statusCode !== 200) {
          edebug(`Error retrieving pricing plan id for resource type ${resourceType}` +
            ` and plan id ${provisioningPlanId}, %d - %o`,
          val.statusCode, val.body || '');

          // Throw response object as an exception to stop further processing.
          return unlock(
            cb(
              undefined,
              error(
                'eppidnotfound',
                `Pricing plan id for resource type ${resourceType} and plan id ${provisioningPlanId} not found`,
                val
              )
            )
          );
        }

        // Return the pricing plan id
        debug(`Retrieved pricing plan id ${provisioningPlanId}`);
        return unlock(
          cb(undefined, {
            pricing_plan_id: cacheId(key, val.body)
          })
        );
      }
    );
  });
};

// Retrieve the specified pricing plan
const plan = (ppid, country, auth, cb) => {
  lock(ppid, (err, unlock) => {
    if (err) return unlock(cb(err));
    debug('Retrieving pricing plan %s', ppid);

    // Look in our cache first
    const c = cached(ppid);
    if (c) {
      debug('Pricing plan %s found in cache', ppid);
      return unlock(
        cb(undefined, {
          pricing_plan: countryPrices(c, country)
        })
      );
    }

    // Lookup and cache test plans
    if (ppid === 'test-pricing-basic' || ppid === 'test-pricing-standard')
      return unlock(
        cb(undefined, {
          pricing_plan: countryPrices(cache(ppid, require('./test/' + ppid)), country)
        })
      );

    // Forward authorization header field to the account plugin
    const o = auth ? { headers: { authorization: auth } } : {};

    // Get the requested pricing plan from the account plugin
    return brequest.get(
      uris.provisioning + '/v1/pricing/plans/:pricing_plan_id',
      extend(o, {
        pricing_plan_id: ppid
      }),
      (err, val) => {
        if (err) {
          edebug(`Error retrieving rating plan ${ppid}, error: %o`, err);
          debug(`Error retrieving rating plan ${ppid}, error: %o`, err);
          return unlock(cb(err));
        }

        // Unable to retrieve pricing plan
        if (val.statusCode !== 200) {
          edebug(`Error retrieving rating plan ${ppid}, %d - %o`, val.statusCode, val.body || '');
          debug(`Error retrieving rating plan ${ppid}, %d - %o`, val.statusCode, val.body || '');

          // Unlock and throw response object as an exception
          // to stop further processing
          return unlock(
            cb(
              undefined,
              error(
                'epplannotfound',
                `Pricing plan with id ${ppid} not found`,
                val
              )
            )
          );
        }

        // Return the pricing plan
        debug(`Retrieved pricing plan ${ppid}`);
        return unlock(
          cb(undefined, {
            pricing_plan: countryPrices(cache(ppid, val.body), country)
          })
        );
      }
    );
  });
};

// Export our public functions
module.exports = plan;
module.exports.plan = plan;
module.exports.id = id;
