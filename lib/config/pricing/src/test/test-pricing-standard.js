'use strict';

// A test resource metered by max storage, API calls, and memory consumption
// over time

/* istanbul ignore file */

module.exports = {
  plan_id: 'test-pricing-standard',
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
};
