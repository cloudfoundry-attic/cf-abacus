'use strict';

// A sample storage service, metered by max gigabytes of storage, thousand
// light API calls and heavy API calls.

/* istanbul ignore file */

module.exports = {
  plan_id: 'standard-object-storage',
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
      type: 'discrete',
      meter: ((m) => new BigNumber(m.storage)
        .div(1073741824).toNumber()).toString(),
      accumulate: ((a, qty, start, end, from, to, twCell) =>
        end < from || end >= to ? null : Math.max(a, qty)).toString()
    },
    {
      name: 'thousand_light_api_calls',
      unit: 'THOUSAND_CALLS',
      type: 'discrete',
      meter: ((m) => new BigNumber(m.light_api_calls)
        .div(1000).toNumber()).toString(),
      aggregate: ((a, prev, curr, aggTwCell, accTwCell) =>
        new BigNumber(a || 0).add(curr).sub(prev).toNumber()).toString()
    },
    {
      name: 'heavy_api_calls',
      unit: 'CALL',
      type: 'discrete',
      meter: ((m) => m.heavy_api_calls).toString()
    }]
};

