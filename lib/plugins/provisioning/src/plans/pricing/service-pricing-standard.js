'use strict';

/* istanbul ignore file */

module.exports = {
  plan_id: 'service-pricing-standard',
  metrics: [
    {
      name: 'instances',
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
