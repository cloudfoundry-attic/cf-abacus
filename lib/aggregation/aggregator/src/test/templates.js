'use strict';

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

module.exports = {
  accumulatedUsageBody
};
