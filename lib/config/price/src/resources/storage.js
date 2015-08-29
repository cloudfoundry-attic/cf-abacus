'use strict';

module.exports = {
  plans: [
    {
      plan_id: 'basic',
      metrics: [
        {
          id: 'storage',
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
          id: 'thousand_light_api_calls',
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
          id: 'heavy_api_calls',
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
    },
    {
      plan_id: 'standard',
      metrics: [
        {
          id: 'storage',
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
          id: 'thousand_light_api_calls',
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
          id: 'heavy_api_calls',
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
    }]
};

