'use strict';


const debug = require('abacus-debug')('abacus-ext-provisioning-plugin');
const lockcb = require('abacus-lock');
const yieldable = require('abacus-yieldable');
const lru = require('abacus-lrucache');
const partition = require('abacus-partition');
const urienv = require('abacus-urienv');

const _ = require('underscore');
const extend = _.extend;
const omit = _.omit;

const batch = require('abacus-batch');
const breaker = require('abacus-breaker');
const retry = require('abacus-retry');
const dbclient = require('abacus-dbclient');

const schemas = require('abacus-usage-schemas');

const meteringLock = yieldable(lockcb.locker('mprovision'));
const ratingLock = yieldable(lockcb.locker('rprovision'));
const pricingLock = yieldable(lockcb.locker('pprovision'));

const dbalias = process.env.DBALIAS || 'db';

const uris = urienv({
  [dbalias]: 5984
});

const ratingdb = yieldable(retry(breaker(batch(
  dbclient(partition.singleton,
    dbclient.dburi(uris[dbalias], 'abacus-rating-plans'))))));

const pricingdb = yieldable(retry(breaker(batch(
  dbclient(partition.singleton,
    dbclient.dburi(uris[dbalias], 'abacus-pricing-plans'))))));

const meteringdb = yieldable(retry(breaker(batch(
  dbclient(partition.singleton,
    dbclient.dburi(uris[dbalias], 'abacus-metering-plans'))))));


const createLRU = () => {
  return lru({
    max: 1000,
    maxAge: 1000 * 60 * 20
  });
};

const cache = (lruCache) => {
  return {
    read: (key) => {
      return lruCache.get(key);
    },
    write: (key, value) => {
      lruCache.set(key, value);
      return value;
    }
  };
};

const meteringCache = cache(createLRU());
const pricingCache = cache(createLRU());
const ratingCache = cache(createLRU());
const noCache = {
  read: (key) => undefined,
  write: (key, value) => value
};

// Retrieve a plan. Search in cache first, then in the plan database
const findPlan = function*(pid, lock, db, cache) {
  const unlock = yield lock(pid);
  try {
    const cp = cache.read(pid);
    if(cp) {
      debug('Plan %s found in cache', pid);
      return cp;
    }

    const doc = yield db.get(['k', pid].join('/'));
    if(doc) {
      debug('Plan %s found in db', pid);
      const undbified = omit(dbclient.undbify(doc), 'id');
      return cache.write(pid, undbified);
    }

    return undefined;
  } finally {
    unlock();
  }
};

const create = function*(db, validator, planBody) {
  validator.validate(planBody);
  const planId = planBody.plan_id;
  const id = ['k', planId].join('/');

  debug('Creating new plan: %o', planBody);
  yield db.put(extend({}, planBody, {
    _id: id
  }));

  debug('Plan: %o ', planBody);
};

const update = function*(db, validator, planId, planBody) {
  validator.validate(planBody);

  const id = ['k', planId].join('/');
  const doc = yield db.get(id);
  if(doc) {
    debug('Plan %s found. Updating ...', planId);
    yield db.put(extend({}, planBody, {
      _id: id,
      _rev: doc._rev,
      plan_id: planId
    }));
  } else {
    debug('Plan with id %s not found', planId);
    throw {
      statusCode: 404,
      message: 'Plan not found'
    };
  }

  debug('Plan: %o ', planBody);
};

module.exports = {
  read: (opts) => ({
    metering: function*(id) {
      return yield findPlan(id, meteringLock, meteringdb,
        opts.cache ? meteringCache : noCache);
    },
    pricing: function*(id) {
      return yield findPlan(id, pricingLock, pricingdb,
        opts.cache ? pricingCache : noCache);
    },
    rating: function*(id) {
      return yield findPlan(id, ratingLock, ratingdb,
        opts.cache ? ratingCache : noCache);
    }
  }),

  create: {
    metering : function*(planBody) {
      return yield create(meteringdb, schemas.meteringPlan, planBody);
    },
    pricing : function*(planBody) {
      return yield create(pricingdb, schemas.pricingPlan, planBody);
    },
    rating : function*(planBody) {
      return yield create(ratingdb, schemas.ratingPlan, planBody);
    }
  },

  update: {
    metering : function*(planId, planBody) {
      return yield update(meteringdb, schemas.meteringPlan, planId, planBody);
    },
    pricing : function*(planId, planBody) {
      return yield update(pricingdb, schemas.pricingPlan, planId, planBody);
    },
    rating : function*(planId, planBody) {
      return yield update(ratingdb, schemas.ratingPlan, planId, planBody);
    }
  }
};
