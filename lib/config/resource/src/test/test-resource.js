'use strict';

// A test resource metered by max storage, API calls, and memory consumption
// over time

/* istanbul ignore file */

module.exports = {
  resource_id: 'test-resource',
  effective: 1420070400000,
  measures: [
    {
      name: 'instance_memory',
      unit: 'GIGABYTE'
    },
    {
      name: 'running_instances',
      unit: 'INSTANCE'
    },
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
      aggregate: ((a, prev, curr) => (a || 0) + curr - prev).toString(),
      charge: ((t, cost) => cost).toString()
    },
    {
      name: 'heavy_api_calls',
      unit: 'CALL',
      meter: ((m) => m.heavy_api_calls).toString(),
      rate: ((price, qty) => (price || 0) * qty).toString()
    },
    {
      name: 'memory',
      unit: 'GIGABYTE',

      meter: ((m) => ({
        consuming: m.instance_memory * m.running_instances,
        since: m.start
      })).toString(),

      accumulate: ((a, qty) => ({
        consumed: a ?
          a.consumed + a.consuming * (qty.since - a.since) : 0,
        consuming: qty.consuming,
        since: qty.since
      })).toString(),

      aggregate: ((a, prev, curr) => {
        const consuming = curr.consuming - (prev ? prev.consuming : 0);
        return a ? {
          consumed: a.consumed +
            a.consuming * Math.max(0, curr.since - a.since) +
            consuming * Math.max(0, a.since - curr.since),
          consuming: a.consuming + consuming,
          since: Math.max(a.since, curr.since)
        } : {
          consumed: 0,
          consuming: consuming,
          since: curr.since
        };

      }).toString(),

      rate: ((price, qty) => ({
        burned: (price || 0) * qty.consumed,
        burning: (price || 0) * qty.consuming,
        since: qty.since
      })).toString(),

      summarize: ((t, qty) => qty.consumed +
        qty.consuming * Math.max(0, t - qty.since) / 1000).toString(),

      charge: ((t, cost) => cost.burned +
        cost.burning * Math.max(0, t - cost.since) / 1000).toString()
    }]
};

