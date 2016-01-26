'use strict';

// A sample container service metered by memory consumption over time

/* istanbul ignore file */

module.exports = {
  pricing_plan_id: 'linux-pricing-basic',
  pricing_metrics: [
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
};

