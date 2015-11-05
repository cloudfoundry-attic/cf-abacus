'use strict';

// A sample storage service, metered by max gigabytes of storage, thousand
// light API calls and heavy API calls.

/* istanbul ignore file */

module.exports = {
  resource_id: 'object-storage',
  effective: 1420070400000,
  measures: [
    {
      name: 'storage',
      unit: 'BYTE'
    },
    {
      name: 'light_api_calls',
      unit: 'CALL'
    },
    {
      name: 'heavy_api_calls',
      unit: 'CALL'
    }],
  metrics: [
    {
      name: 'storage',
      unit: 'GIGABYTE',
      meter: ((m) => new BigNumber(m.storage)
        .div(1073741824).toNumber()).toString(),
      accumulate: ((a, qty) => Math.max(a, qty)).toString(),
      rate: ((price, qty) => new BigNumber(price || 0)
        .mul(qty).toNumber()).toString()
    },
    {
      name: 'thousand_light_api_calls',
      unit: 'THOUSAND_CALLS',
      meter: ((m) => new BigNumber(m.light_api_calls)
        .div(1000).toNumber()).toString(),
      aggregate: ((a, prev, curr) => new BigNumber(a || 0)
        .add(curr).sub(prev).toNumber()).toString(),
      charge: ((t, cost) => cost ? cost : 0).toString()
    },
    {
      name: 'heavy_api_calls',
      unit: 'CALL',
      meter: ((m) => m.heavy_api_calls).toString(),
      rate: ((price, qty) => new BigNumber(qty)
        .mul(price || 0).toNumber()).toString()
    }]
};

