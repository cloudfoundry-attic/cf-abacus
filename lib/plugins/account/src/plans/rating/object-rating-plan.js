'use strict';

// A sample storage service, rating gigabytes of storage, thousand
// light API calls and heavy API calls.

/* istanbul ignore file */

module.exports = {
  plan_id: 'object-rating-plan',
  metrics: [
    {
      name: 'storage',
      rate: ((price, qty) => new BigNumber(price || 0)
        .mul(qty).toNumber()).toString()
    },
    {
      name: 'thousand_light_api_calls',
      charge: ((t, cost, from, to) => cost ? cost : 0).toString()
    },
    {
      name: 'heavy_api_calls',
      rate: ((price, qty) => new BigNumber(qty)
        .mul(price || 0).toNumber()).toString()
    }
  ]
};
