'use strict';

const meteredUsageBody = (timestamp, quantity) => ({
  normalized_usage_id: '330',
  start: timestamp,
  end: timestamp,
  collected_usage_id: '555',
  metered_usage_id: '422',
  resource_id: 'test-resource',
  resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
  organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
  space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
  consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
  plan_id: 'basic',
  resource_type: 'test',
  account_id: '1234',
  pricing_country: 'USA',
  metering_plan_id: 'test-metering-plan',
  rating_plan_id: 'test-rating-plan',
  pricing_plan_id: 'test-pricing-basic',
  prices: {
    metrics: [
      { name: 'storage', price: 1 },
      {
        name: 'thousand_light_api_calls',
        price: 0.03
      },
      { name: 'heavy_api_calls', price: 0.15 },
      { name: 'memory', price: 0.00014 }
    ]
  },
  metered_usage: [
    { metric: 'heavy_api_calls', quantity: quantity }
  ]
});

module.exports = {
  meteredUsageBody
};
