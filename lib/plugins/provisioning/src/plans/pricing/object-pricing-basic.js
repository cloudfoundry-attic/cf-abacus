'use strict';

// A sample storage service, metered by max gigabytes of storage, thousand
// light API calls and heavy API calls.

/* istanbul ignore file */

module.exports = {
  plan_id: 'object-pricing-basic',
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
    }]
};
