'use strict';

// A test resource metered by max storage, API calls, and memory consumption
// over time

/* istanbul ignore file */

module.exports = {
  resource_id: 'test-resource',
  effective: 1420070400000,
  metering_plans: [
    {
      metering_plan_id: 'basic',
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
        },
        {
          name: 'memory',
          unit: 'GIGABYTE',

          meter: ((m) => ({
            consuming: new BigNumber(m.instance_memory)
              .mul(m.running_instances).toNumber(),
            since: m.start
          })).toString(),

          accumulate: ((a, qty) => ({
            consumed: a ? new BigNumber(a.consuming).mul(qty.since - a.since)
              .add(a.consumed).toNumber() : 0,
            consuming: qty.consuming,
            since: qty.since
          })).toString(),

          aggregate: ((a, prev, curr) => {
            const consuming = new BigNumber(curr.consuming)
              .sub(prev ? prev.consuming : 0);
            return a ? {
              consumed: consuming.mul(Math.max(0, a.since - curr.since)).add(
                new BigNumber(a.consuming).mul(
                Math.max(0, curr.since - a.since))
              ).add(a.consumed).toNumber(),
              consuming: consuming.add(a.consuming).toNumber(),
              since: Math.max(a.since, curr.since)
            } : {
              consumed: 0,
              consuming: consuming.toNumber(),
              since: curr.since
            };

          }).toString(),

          summarize: ((t, qty, from, to) => qty ? new BigNumber(qty.consuming)
            .mul(Math.max(0, Math.min(t, to) - qty.since)).div(1000)
            .add(qty.consumed).toNumber() : 0).toString()
        }]
    },
    {
      metering_plan_id: 'standard',
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
        },
        {
          name: 'memory',
          unit: 'GIGABYTE',

          meter: ((m) => ({
            consuming: new BigNumber(m.instance_memory)
              .mul(m.running_instances).toNumber(),
            since: m.start
          })).toString(),

          accumulate: ((a, qty) => ({
            consumed: a ? new BigNumber(a.consuming).mul(qty.since - a.since)
              .add(a.consumed).toNumber() : 0,
            consuming: qty.consuming,
            since: qty.since
          })).toString(),

          aggregate: ((a, prev, curr) => {
            const consuming = new BigNumber(curr.consuming)
              .sub(prev ? prev.consuming : 0);
            return a ? {
              consumed: consuming.mul(Math.max(0, a.since - curr.since)).add(
                new BigNumber(a.consuming).mul(
                Math.max(0, curr.since - a.since))
              ).add(a.consumed).toNumber(),
              consuming: consuming.add(a.consuming).toNumber(),
              since: Math.max(a.since, curr.since)
            } : {
              consumed: 0,
              consuming: consuming.toNumber(),
              since: curr.since
            };

          }).toString(),

          summarize: ((t, qty, from, to) => qty ? new BigNumber(qty.consuming)
            .mul(Math.max(0, Math.min(t, to) - qty.since)).div(1000)
            .add(qty.consumed).toNumber() : 0).toString()
        }]
    }
  ]
};

