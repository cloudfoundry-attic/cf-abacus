'use strict';

// A sample storage service, metered by max gigabytes of storage, thousand
// light API calls and heavy API calls.

/* istanbul ignore file */

module.exports = {
  plan_id: 'object-pricing-standard',
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
    }]
};

