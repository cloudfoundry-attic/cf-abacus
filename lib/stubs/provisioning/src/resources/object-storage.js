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
      meter: ((m) => m.storage / 1073741824).toString(),
      accumulate: ((a, qty) => Math.max(a, qty)).toString(),
      rate: ((price, qty) => (price || 0) * qty).toString()
    },
    {
      name: 'thousand_light_api_calls',
      unit: 'THOUSAND_CALLS',
      meter: ((m) => m.light_api_calls / 1000).toString(),
      accumulate: ((a, qty) => (a || 0) + qty).toString(),
      aggregate: ((a, prev, curr) => (a || 0) + curr - prev).toString(),
      rate: ((price, qty) => (price || 0) * qty).toString(),
      summarize: ((t, qty) => qty).toString(),
      charge: ((t, cost) => cost).toString()
    },
    {
      name: 'heavy_api_calls',
      unit: 'CALL',
      meter: ((m) => m.heavy_api_calls).toString(),
      rate: ((price, qty) => (price || 0) * qty).toString()
    }]
};

