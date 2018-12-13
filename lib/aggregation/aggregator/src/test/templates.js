'use strict';

// const { extend } = require('underscore');

const dbclient = require('abacus-dbclient');

const accumulatedUsageBody = (timestamp, quantity) => ({
  id: 'id',
  collected_usage_id: '555',
  start: timestamp,
  end: timestamp,
  processed: timestamp,
  resource_id: 'resource-id',
  resource_instance_id: 'resource-instance-id',
  organization_id: 'org-id',
  space_id: 'space-id',
  consumer_id: 'consumer-id',
  plan_id: 'basic',
  resource_type: 'resource-type',
  account_id: '1234',
  pricing_country: 'USA',
  metering_plan_id: 'test-metering-plan',
  rating_plan_id: 'test-rating-plan',
  pricing_plan_id: 'test-pricing-basic',
  prices: {
    metrics: [{ name: 'heavy_api_calls', price: 0.15 }, { name: 'memory', price: 0.00014 }]
  },
  accumulated_usage: [
    {
      metric: 'heavy_api_calls',
      windows: [
        [null],
        [null],
        [null],
        [{ quantity: { current: quantity } }, null, null],
        [{ quantity: { current: quantity } }, null]]
    }
  ]
});

// Template for creating accumulated usage
const buildAccumulatedUsage = (rid, s, e, p, api, dmem, mmem) => ({
  id: dbclient.kturi(rid, p),
  collected_usage_id: 'collector-id',
  start: s,
  end: e,
  processed: p,
  resource_id: 'test-resource',
  resource_instance_id: rid,
  organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
  space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
  consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
  plan_id: 'basic',
  resource_type: 'test-resource-type',
  account_id: '1234',
  metering_plan_id: 'test-metering-plan',
  rating_plan_id: 'test-rating-plan',
  pricing_plan_id: 'test-pricing-basic',
  accumulated_usage: [
    {
      metric: 'heavy_api_calls',
      windows: [[null], [null], [null], [api, null, null], [api, null]]
    },
    {
      metric: 'memory',
      windows: [[null], [null], [null], [dmem, null, null], [mmem, null]]
    }
  ]
});


module.exports = {
  buildAccumulatedUsage,
  accumulatedUsageBody
};
