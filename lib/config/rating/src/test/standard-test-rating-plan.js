'use strict';

// A test resource metered by max storage, API calls, and memory consumption
// over time

/* istanbul ignore file */

module.exports = {
  plan_id: 'standard-test-rating-plan',
  metrics: [
    {
      name: 'storage',
      rate: ((price, qty) => new BigNumber(price || 0)
        .mul(qty).toNumber()).toString()
    },
    {
      name: 'thousand_light_api_calls',
      charge: ((t, cost) => cost ? cost : 0).toString()
    },
    {
      name: 'heavy_api_calls',
      rate: ((price, qty) => new BigNumber(qty)
        .mul(price || 0).toNumber()).toString()
    },
    {
      name: 'memory',
      rate: ((price, qty) => ({
        burned: new BigNumber(qty.consumed).mul(price || 0).toNumber(),
        burning: new BigNumber(qty.consuming).mul(price || 0).toNumber(),
        since: qty.since
      })).toString(),
      charge: ((t, cost, from, to) => cost ? new BigNumber(cost.burning)
        .mul(Math.max(0, Math.min(t, to) - cost.since)).div(1000)
        .add(cost.burned).toNumber() : 0).toString()
    }
  ]
};
