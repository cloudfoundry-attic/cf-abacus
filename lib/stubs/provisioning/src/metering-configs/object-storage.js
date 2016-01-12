'use strict';

// A sample storage service, metered by max gigabytes of storage, thousand
// light API calls and heavy API calls.

/* istanbul ignore file */

module.exports = {
  resource_id: 'object-storage',
  effective: 1420070400000,
  metering_plans: [
    {
      metering_plan_id: 'basic',
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
          accumulate: ((a, qty) => Math.max(a, qty)).toString()
        },
        {
          name: 'thousand_light_api_calls',
          unit: 'THOUSAND_CALLS',
          meter: ((m) => new BigNumber(m.light_api_calls)
            .div(1000).toNumber()).toString(),
          aggregate: ((a, prev, curr) => new BigNumber(a || 0)
            .add(curr).sub(prev).toNumber()).toString()
        },
        {
          name: 'heavy_api_calls',
          unit: 'CALL',
          meter: ((m) => m.heavy_api_calls).toString()
        }]
    },
    {
      metering_plan_id: 'standard',
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
          accumulate: ((a, qty) => Math.max(a, qty)).toString()
        },
        {
          name: 'thousand_light_api_calls',
          unit: 'THOUSAND_CALLS',
          meter: ((m) => new BigNumber(m.light_api_calls)
            .div(1000).toNumber()).toString(),
          aggregate: ((a, prev, curr) => new BigNumber(a || 0)
            .add(curr).sub(prev).toNumber()).toString()
        },
        {
          name: 'heavy_api_calls',
          unit: 'CALL',
          meter: ((m) => m.heavy_api_calls).toString()
        }]
    }
  ]
};

