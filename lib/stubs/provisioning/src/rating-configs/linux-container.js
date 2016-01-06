'use strict';

// A sample container service rated by memory consumption over time

/* istanbul ignore file */

module.exports = {
  resource_id: 'linux-container',
  effective: 1420070400000,
  rating_plans: [
    {
      rating_plan_id: 'basic',
      metrics: [
        {
          name: 'memory',
          unit: 'GIGABYTE',

          rate: ((price, qty) => ({
            burned: new BigNumber(qty.consumed).mul(price || 0).toNumber(),
            burning: new BigNumber(qty.consuming).mul(price || 0).toNumber(),
            since: qty.since
          })).toString(),

          charge: ((t, cost, from, to) => cost ? new BigNumber(cost.burning)
            .mul(Math.max(0, Math.min(t, to) - cost.since)).add(cost.burned)
            .div(3600000).toNumber() : 0).toString()
        }]
    },
    {
      rating_plan_id: 'standard',
      metrics: [
        {
          name: 'memory',
          unit: 'GIGABYTE',

          rate: ((price, qty) => ({
            burned: new BigNumber(qty.consumed).mul(price || 0).toNumber(),
            burning: new BigNumber(qty.consuming).mul(price || 0).toNumber(),
            since: qty.since
          })).toString(),

          charge: ((t, cost, from, to) => cost ? new BigNumber(cost.burning)
            .mul(Math.max(0, Math.min(t, to) - cost.since)).add(cost.burned)
            .div(3600000).toNumber() : 0).toString()
        }]
    }
  ]
};

