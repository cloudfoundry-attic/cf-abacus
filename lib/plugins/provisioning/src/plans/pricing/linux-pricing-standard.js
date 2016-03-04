'use strict';

// A sample container service metered by memory consumption over time

/* istanbul ignore file */

module.exports = {
  plan_id: 'linux-pricing-standard',
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
};

