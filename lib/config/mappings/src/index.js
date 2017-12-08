'use strict';

const fs = require('fs');
const path = require('path');

const _ = require('underscore');
const extend = _.extend;

const batch = require('abacus-batch');
const breaker = require('abacus-breaker');
const dbclient = require('abacus-dbclient');
const lockcb = require('abacus-lock');
const lru = require('abacus-lrucache');
const partition = require('abacus-partition');
const retry = require('abacus-retry');
const urienv = require('abacus-urienv');
const yieldable = require('abacus-yieldable');

// Setup debug log
const debug = require('abacus-debug')('abacus-plan-mappings');
const edebug = require('abacus-debug')('e-abacus-plan-mappings');

// Cache locks
const meteringMappingsLock = yieldable(lockcb.locker('mconfig'));
const ratingMappingsLock = yieldable(lockcb.locker('rconfig'));
const pricingMappingsLock = yieldable(lockcb.locker('pconfig'));

const dbalias = process.env.DBALIAS || 'db';

const uris = urienv({
  [dbalias]: 5984
});

// Configure metering plan mappings db
const meteringMappingsDb = yieldable(
  retry(breaker(batch(dbclient(partition.singleton, dbclient.dburi(uris[dbalias], 'abacus-metering-plan-mappings')))))
);

// Configure rating plan mappings db
const ratingMappingsDb = yieldable(
  retry(breaker(batch(dbclient(partition.singleton, dbclient.dburi(uris[dbalias], 'abacus-rating-plan-mappings')))))
);

// Configure pricing plan mappings db
const pricingMappingsDb = yieldable(
  retry(breaker(batch(dbclient(partition.singleton, dbclient.dburi(uris[dbalias], 'abacus-pricing-plan-mappings')))))
);

// Default maps from (resource_type, plan_name) to plan_id
const mappings = path.join(__dirname, 'plans');
const defaultMeteringMapping = JSON.parse(fs.readFileSync(path.join(mappings, 'metering.json')));
const defaultPricingMapping = JSON.parse(fs.readFileSync(path.join(mappings, 'pricing.json')));
const defaultRatingMapping = JSON.parse(fs.readFileSync(path.join(mappings, 'rating.json')));

// Maintain a cache of metering mappings
const meteringMappingsCache = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a metering mapping
const meteringMappingCache = (key, planId) => {
  meteringMappingsCache.set(key, planId);
  return planId;
};

// Return a metering plan from the cache
const meteringMappingCached = (key) => {
  return meteringMappingsCache.get(key);
};

// Maintain a cache of rating mappings
const ratingMappingsCache = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a rating mapping
const ratingMappingCache = (key, planId) => {
  ratingMappingsCache.set(key, planId);
  return planId;
};

// Return a rating plan from the cache
const ratingMappingCached = (key) => {
  return ratingMappingsCache.get(key);
};

// Maintain a cache of pricing mappings
const pricingMappingsCache = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a pricing mapping
const pricingMappingCache = (key, planId) => {
  pricingMappingsCache.set(key, planId);
  return planId;
};

// Return a pricing plan from the cache
const pricingMappingCached = (key) => {
  return pricingMappingsCache.get(key);
};

const metadata = (id, doc) => {
  let metadata = { _id: id };
  if (doc) metadata = extend(metadata, { _rev: doc._rev });
  return metadata;
};

// Create metering mapping (resourceType, planName) to planId
const newMeteringMapping = function*(resourceType, planName, planId, doc) {
  debug('Storing new metering mapping (%s, %s) -> %s', resourceType, planName, planId);
  const id = ['k', resourceType, planName].join('/');
  yield meteringMappingsDb.put(extend({}, { planId: planId }, metadata(id, doc)));
};

// Create rating mapping (resourceType, planName) to planId
const newRatingMapping = function*(resourceType, planName, planId, doc) {
  debug('Storing new rating mapping (%s, %s) -> %s', resourceType, planName, planId);
  const id = ['k', resourceType, planName].join('/');
  yield ratingMappingsDb.put(extend({}, { planId: planId }, metadata(id, doc)));
};

// Create pricing mapping (resourceType, planName) to planId
const newPricingMapping = function*(resourceType, planName, planId, doc) {
  debug('Storing new pricing mapping (%s, %s) -> %s', resourceType, planName, planId);
  const id = ['k', resourceType, planName].join('/');
  yield pricingMappingsDb.put(extend({}, { planId: planId }, metadata(id, doc)));
};

// Retrieve a mapped metering plan. Search in cache, local resources and
// finally in the metering plan mappings database
const mappedMeteringPlanDoc = function*(resourceType, planName) {
  const id = ['k', resourceType, planName].join('/');
  const unlock = yield meteringMappingsLock(id);
  try {
    debug('Retrieving metering plan for (%s, %s)', resourceType, planName);

    // Look in our cache first
    const cachedDoc = meteringMappingCached(id);
    if (cachedDoc) {
      debug('Metering plan %s found in cache', id);
      return cachedDoc;
    }

    // Look in the metering plan mappings db
    const doc = yield meteringMappingsDb.get(id);
    if (doc) debug('Metering plan %s found in db', id);
    return doc ? meteringMappingCache(id, doc) : doc;
  } finally {
    unlock();
  }
};

const mappedMeteringPlan = function*(resourceType, planName) {
  const doc = yield mappedMeteringPlanDoc(resourceType, planName);
  return doc ? dbclient.undbify(doc).planId : doc;
};

// Retrieve a mapped rating plan. Search in cache, then in the
// rating plan mappings database
const mappedRatingPlanDoc = function*(resourceType, planName) {
  const id = ['k', resourceType, planName].join('/');
  const unlock = yield ratingMappingsLock(id);
  try {
    debug('Retrieving rating plan for (%s, %s)', resourceType, planName);

    // Look in our cache first
    const cachedDoc = ratingMappingCached(id);
    if (cachedDoc) {
      debug('Rating plan %s found in cache', id);
      return cachedDoc;
    }

    // Look in the metering plan mappings db
    const doc = yield ratingMappingsDb.get(id);
    if (doc) debug('Rating plan %s found in db', id);
    return doc ? ratingMappingCache(id, doc) : doc;
  } finally {
    unlock();
  }
};

const mappedRatingPlan = function*(resourceType, planName) {
  const doc = yield mappedRatingPlanDoc(resourceType, planName);
  return doc ? dbclient.undbify(doc).planId : doc;
};

// Retrieve a mapped pricing plan. Search in cache, then in the
// pricing plan mappings database
const mappedPricingPlanDoc = function*(resourceType, planName) {
  const id = ['k', resourceType, planName].join('/');
  const unlock = yield pricingMappingsLock(id);
  try {
    debug('Retrieving pricing plan for (%s, %s)', resourceType, planName);

    // Look in our cache first
    const cachedDoc = pricingMappingCached(id);
    if (cachedDoc) {
      debug('Pricing plan %s found in cache', id);
      return cachedDoc;
    }

    // Look in the metering plan mappings db
    const doc = yield pricingMappingsDb.get(id);
    if (doc) debug('Pricing plan %s found in db', id);
    return doc ? pricingMappingCache(id, doc) : doc;
  } finally {
    unlock();
  }
};

const mappedPricingPlan = function*(resourceType, planName) {
  const doc = yield mappedPricingPlanDoc(resourceType, planName);
  return doc ? dbclient.undbify(doc).planId : doc;
};

const storeMapping = (type, db, readFn, createFn, mapping, cb) => {
  debug('Creating %s plan mappings ...', type);
  yieldable.functioncb(function*() {
    for (let resourceType in mapping)
      for (let planName in mapping[resourceType]) {
        const doc = yield readFn(resourceType, planName);
        yield createFn(resourceType, planName, mapping[resourceType][planName], doc);
      }
  })((error) => {
    if (error) {
      edebug('Failed to store %s default mappings: %o', type, error);
      throw new Error('Failed to store default mappings');
    }
    debug('Default %s plan mappings created', type);
    cb();
  });
};

// Populate mapping dbs and cache with the default mappings
const storeDefaultMappings = (cb) => {
  let callCount = 0;
  const countCb = () => {
    if (++callCount === 3) cb();
  };

  storeMapping(
    'metering',
    meteringMappingsDb,
    mappedMeteringPlanDoc,
    newMeteringMapping,
    defaultMeteringMapping,
    countCb
  );
  storeMapping('rating', ratingMappingsDb, mappedRatingPlanDoc, newRatingMapping, defaultRatingMapping, countCb);
  storeMapping('pricing', pricingMappingsDb, mappedPricingPlanDoc, newPricingMapping, defaultPricingMapping, countCb);
};

// Module exports
module.exports.sampleMetering = defaultMeteringMapping;
module.exports.samplePricing = defaultPricingMapping;
module.exports.sampleRating = defaultRatingMapping;

module.exports.newMeteringMapping = newMeteringMapping;
module.exports.newRatingMapping = newRatingMapping;
module.exports.newPricingMapping = newPricingMapping;

module.exports.mappedMeteringPlan = mappedMeteringPlan;
module.exports.mappedRatingPlan = mappedRatingPlan;
module.exports.mappedPricingPlan = mappedPricingPlan;

module.exports.storeDefaultMappings = storeDefaultMappings;
