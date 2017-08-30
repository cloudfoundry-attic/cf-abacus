'use strict';

const extmappings = require('abacus-ext-plan-mappings');
const mappings = require('abacus-plan-mappings');
const yieldable = require('abacus-yieldable');

const debug = require('abacus-debug')('abacus-cf-services-mappings');
const edebug = require('abacus-debug')('e-abacus-cf-services-mappings');

const storeServiceMappings = (servicesConfig, cb) => {
  debug('Store service mappings...');
  const rev = { _rev: 1 };
  yieldable.functioncb(function *() {
    for (let service in servicesConfig)
      for (let plan of servicesConfig[service].plans) {
        yield extmappings.newMeteringMapping(service, plan,
          mappings.sampleMetering.service.standard, rev);
        yield extmappings.newPricingMapping(service, plan,
          mappings.samplePricing.service.standard, rev);
        yield extmappings.newRatingMapping(service, plan,
          mappings.sampleRating.service.standard, rev);
      }
  })((err) => {
    if (err) {
      edebug('Failed to store service mappings due to %o', err);
      return cb(err);
    }
    return cb();
  });
};

module.exports.storeServiceMappings = storeServiceMappings;
