'use strict';

// A test resource metered by max storage, API calls, and memory consumption
// over time

/* istanbul ignore file */

module.exports = {
  resource_id: 'test-resource',
  effective: 1420070400000,
  rating_plans: [
    {
      rating_plan_id: 'basic',
      metrics: [
        {
          name: 'storage',
          prices: [
            {
              country: 'USA',
              price: 0.90
            },
            {
              country: 'EUR',
              price: 0.6523
            },
            {
              country: 'CAN',
              price: 0.96
            }]
        },
        {
          name: 'thousand_light_api_calls',
          prices: [
            {
              country: 'USA',
              price: 0.02
            },
            {
              country: 'EUR',
              price: 0.0126
            },
            {
              country: 'CAN',
              price: 0.0217
            }]
        },
        {
          name: 'heavy_api_calls',
          prices: [
            {
              country: 'USA',
              price: 0.05
            },
            {
              country: 'EUR',
              price: 0.0129
            },
            {
              country: 'CAN',
              price: 0.0585
            }]
        },
        {
          name: 'memory',
          prices: [
            {
              country: 'USA',
              price: 0.00013
            },
            {
              country: 'EUR',
              price: 0.00009
            },
            {
              country: 'CAN',
              price: 0.00014
            }]
        }]
    },
    {
      rating_plan_id: 'standard',
      metrics: [
        {
          name: 'storage',
          prices: [
            {
              country: 'USA',
              price: 0.40
            },
            {
              country: 'EUR',
              price: 0.35
            },
            {
              country: 'CAN',
              price: 0.55
            }]
        },
        {
          name: 'thousand_light_api_calls',
          prices: [
            {
              country: 'USA',
              price: 0.03
            },
            {
              country: 'EUR',
              price: 0.03
            },
            {
              country: 'CAN',
              price: 0.04
            }]
        },
        {
          name: 'heavy_api_calls',
          prices: [
            {
              country: 'USA',
              price: 0.17
            },
            {
              country: 'EUR',
              price: 0.15
            },
            {
              country: 'CAN',
              price: 0.23
            }]
        },
        {
          name: 'memory',
          prices: [
            {
              country: 'USA',
              price: 0.00027
            },
            {
              country: 'EUR',
              price: 0.00020
            },
            {
              country: 'CAN',
              price: 0.00028
            }]
        }]
    }]
};

