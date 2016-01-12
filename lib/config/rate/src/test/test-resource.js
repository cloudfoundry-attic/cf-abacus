'use strict';

// A test rating resource

/* istanbul ignore file */

module.exports = {
  resource_id: 'test-resource',
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
          charge: ((t, cost) => cost ? cost : 0).toString()
        },
        {
          name: 'heavy_api_calls',
          unit: 'CALL',
          rate: ((price, qty) => new BigNumber(qty)
            .mul(price || 0).toNumber()).toString()
        },
        {
          name: 'memory',
          unit: 'GIGABYTE',
          rate: ((price, qty) => ({
            burned: new BigNumber(qty.consumed).mul(price || 0).toNumber(),
            burning: new BigNumber(qty.consuming).mul(price || 0).toNumber(),
            since: qty.since
          })).toString(),
          charge: ((t, cost, from, to) => cost ? new BigNumber(cost.burning)
            .mul(Math.max(0, Math.min(t, to) - cost.since)).div(1000)
            .add(cost.burned).toNumber() : 0).toString()
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
          charge: ((t, cost) => cost ? cost : 0).toString()
        },
        {
          name: 'heavy_api_calls',
          unit: 'CALL',
          rate: ((price, qty) => new BigNumber(qty)
            .mul(price || 0).toNumber()).toString()
        },
        {
          name: 'memory',
          unit: 'GIGABYTE',
          rate: ((price, qty) => ({
            burned: new BigNumber(qty.consumed).mul(price || 0).toNumber(),
            burning: new BigNumber(qty.consuming).mul(price || 0).toNumber(),
            since: qty.since
          })).toString(),
          charge: ((t, cost, from, to) => cost ? new BigNumber(cost.burning)
            .mul(Math.max(0, Math.min(t, to) - cost.since)).div(1000)
            .add(cost.burned).toNumber() : 0).toString()
        }]
    }
  ]
};

