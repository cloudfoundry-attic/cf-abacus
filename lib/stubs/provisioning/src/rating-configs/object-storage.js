'use strict';

// A sample storage service, rating gigabytes of storage, thousand
// light API calls and heavy API calls.

/* istanbul ignore file */

module.exports = {
  resource_id: 'object-storage',
  effective: 1420070400000,
  rating_plans: [
    {
      rating_plan_id: 'basic',
      metrics: [
        {
          name: 'storage',
          unit: 'GIGABYTE',
          rate: ((price, qty) => new BigNumber(price || 0)
            .mul(qty).toNumber()).toString()
        },
        {
          name: 'thousand_light_api_calls',
          unit: 'THOUSAND_CALLS',
          charge: ((t, cost, from, to) => cost ? cost : 0).toString()
        },
        {
          name: 'heavy_api_calls',
          unit: 'CALL',
          rate: ((price, qty) => new BigNumber(qty)
            .mul(price || 0).toNumber()).toString()
        }]
    },
    {
      rating_plan_id: 'standard',
      metrics: [
        {
          name: 'storage',
          unit: 'GIGABYTE',
          rate: ((price, qty) => new BigNumber(price || 0)
            .mul(qty).toNumber()).toString()
        },
        {
          name: 'thousand_light_api_calls',
          unit: 'THOUSAND_CALLS',
          charge: ((t, cost, from, to) => cost ? cost : 0).toString()
        },
        {
          name: 'heavy_api_calls',
          unit: 'CALL',
          rate: ((price, qty) => new BigNumber(qty)
            .mul(price || 0).toNumber()).toString()
        }]
    }
  ]
};

