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
              price: 1.00
            },
            {
              country: 'EUR',
              price: 0.7523
            },
            {
              country: 'CAN',
              price: 1.06
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
              price: 0.0226
            },
            {
              country: 'CAN',
              price: 0.0317
            }]
        },
        {
          name: 'heavy_api_calls',
          prices: [
            {
              country: 'USA',
              price: 0.15
            },
            {
              country: 'EUR',
              price: 0.1129
            },
            {
              country: 'CAN',
              price: 0.1585
            }]
        },
        {
          name: 'memory',
          prices: [
            {
              country: 'USA',
              price: 0.00014
            },
            {
              country: 'EUR',
              price: 0.00010
            },
            {
              country: 'CAN',
              price: 0.00015
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
              price: 0.50
            },
            {
              country: 'EUR',
              price: 0.45
            },
            {
              country: 'CAN',
              price: 0.65
            }]
        },
        {
          name: 'thousand_light_api_calls',
          prices: [
            {
              country: 'USA',
              price: 0.04
            },
            {
              country: 'EUR',
              price: 0.04
            },
            {
              country: 'CAN',
              price: 0.05
            }]
        },
        {
          name: 'heavy_api_calls',
          prices: [
            {
              country: 'USA',
              price: 0.18
            },
            {
              country: 'EUR',
              price: 0.16
            },
            {
              country: 'CAN',
              price: 0.24
            }]
        },
        {
          name: 'memory',
          prices: [
            {
              country: 'USA',
              price: 0.00028
            },
            {
              country: 'EUR',
              price: 0.00021
            },
            {
              country: 'CAN',
              price: 0.00029
            }]
        }]
    }]
};

