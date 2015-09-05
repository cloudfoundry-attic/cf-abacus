'use strict';

// A sample container service metered by memory consumption over time

module.exports = {
  resource_id: 'container',
  plans: [
    {
      plan_id: 'basic',
      metrics: [
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
      plan_id: 'standard',
      metrics: [
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

