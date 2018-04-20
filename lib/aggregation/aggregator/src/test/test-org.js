/* eslint-disable */

'use strict'

module.exports = (startTime, endTime, processed) => ({
  _id: 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28/t/0001521709200000',
  organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28',
  resources: [{
    resource_id: 'test-resource',
    plans: [{
      plan_id: 'basic/test-metering-plan/test-rating-plan/test-pricing-basic',
      aggregated_usage: [{
        metric: 'heavy_api_calls',
        windows: [
          [{
            quantity: 0,
            previous_quantity: null,
            cost: 0
          }],
          [{
            quantity: 0,
            previous_quantity: null,
            cost: 0
          }],
          [{
            quantity: 80,
            previous_quantity: 80,
            cost: 0
          }],
          [{
            quantity: 80,
            previous_quantity: 80,
            cost: 0
          },
          {
            quantity: 2810,
            cost: 0
          },
          {
            quantity: 1496,
            cost: 0
          },
          {
            quantity: 4994,
            cost: 0
          },
          {
            quantity: 0,
            cost: 0
          },
          {
            quantity: 0,
            cost: 0
          }
          ],
          [{
            quantity: 5290931,
            previous_quantity: 5290931,
            cost: 0
          },
          {
            quantity: 0,
            cost: 0
          }
          ]
        ]
      }],
      metering_plan_id: 'test-metering-plan',
      rating_plan_id: 'test-rating-plan',
      pricing_plan_id: 'test-pricing-basic'
    }]
  }],
  spaces: [{
    space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
    resources: [{
      resource_id: 'test-resource',
      plans: [{
        plan_id: 'basic',
        aggregated_usage: [{
          metric: 'heavy_api_calls',
          windows: [
            [{
              quantity: 0,
              previous_quantity: null,
              cost: 0
            }],
            [{
              quantity: 0,
              previous_quantity: null,
              cost: 0
            }],
            [{
              quantity: 80,
              previous_quantity: 80,
              cost: 0
            }],
            [{
              quantity: 80,
              previous_quantity: 80,
              cost: 0
            },
            {
              quantity: 2810,
              cost: 0
            },
            {
              quantity: 1496,
              cost: 0
            },
            {
              quantity: 4994,
              cost: 0
            },
            {
              quantity: 0,
              cost: 0
            },
            {
              quantity: 0,
              cost: 0
            }
            ],
            [{
              quantity: 5290931,
              previous_quantity: 5290931,
              cost: 0
            },
            {
              quantity: 0,
              cost: 0
            }
            ]
          ]
        }],
        metering_plan_id: 'test-metering-plan',
        rating_plan_id: 'test-rating-plan',
        pricing_plan_id: 'test-pricing-basic'
      }]
    }],
    consumers: [{
      id : "external:bbeae239-f3f8-483c-9dd0-de6781c38bab",
      t : "0001521712800000"
    }]
  }],
  account_id: '1234',
  start: startTime,
  end: endTime,
  resource_instance_id: '760b3d94-8fb3-40ef-aa28-fddfe8bd5e04',
  consumer_id: 'na',
  resource_id: 'test-resource',
  plan_id: 'basic',
  pricing_country: 'USA',
  prices: {
    metrics: [{
      name: 'heavy_api_calls',
      price: 0
    }
    ]
  },
  processed: processed,
  accumulated_usage_id: 't/0001521712768862-4-0-0-0/k/idz:f09acd6f-9006-44e3-8846-eb2b65de8827',
  id: 'k/a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28/t/0001521709200000',
  processed_id: '0001521712768862-4-0-0-0',
  _rev: '1'
});
