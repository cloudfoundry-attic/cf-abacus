'use strict';

// A test metering plan for a resource metered by max storage, API calls,
// and memory consumption over time

// Memory consumption over time

// This formula will resolve out of order submission by submitting current
//   usage and previous usage.

// To start A, an instance of 1 gb:
//   current_running_instances: 1,
//   current_instance_memory: 1073741824,
//   previous_running_instances: 0,
//   previous_instance_memory: 0

// To update A, an instance from 1 gb to 2 instance of 2 gb:
//   current_running_instances: 2,
//   current_instance_memory: 2147483648,
//   previous_running_instances: 1,
//   previous_instance_memory: 1073741824

// To stop A,
//   current_running_instances: 0,
//   current_instance_memory: 0,
//   previous_running_instances: 2,
//   previous_instance_memory: 2147483648

// The requirement to use this formula is to also submit the previous usage.

// The algorithm works like this:
// When the app consumes memory, in the past before it is stopped / in the
//   future after it is started, the app will add negative consumption.
// When the app does not consumes memory, in the past before it is started /
//   in the future after it is stopped, the app will add positive consumption.

/* istanbul ignore file */

module.exports = {
  plan_id: 'test-metering-plan',
  measures: [
    {
      name: 'current_instance_memory',
      unit: 'GIGABYTE'
    },
    {
      name: 'current_running_instances',
      unit: 'NUMBER'
    },
    {
      name: 'previous_instance_memory',
      unit: 'GIGABYTE'
    },
    {
      name: 'previous_running_instances',
      unit: 'NUMBER'
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
    },
    {
      name: 'memory',
      unit: 'GIGABYTE',
      type: 'discrete',

      meter: ((m) => ({
        previous_consuming: new BigNumber(m.previous_instance_memory || 0)
          .div(1073741824).mul(m.previous_running_instances || 0)
          .mul(-1).toNumber(),
        consuming: new BigNumber(m.current_instance_memory || 0)
          .div(1073741824).mul(m.current_running_instances || 0).toNumber()
      })).toString(),

      accumulate: ((a, qty, start, end, from, to, twCell) => {
        // Do not accumulate usage out of boundary
        if (end < from || end >= to)
          return null;

        const past = from - start;
        const future = to - start;
        const td = past + future;
        return {
          // Keep the consuming & since to the latest value
          consuming: a && a.since > start ? a.consuming : qty.consuming,
          consumed: new BigNumber(qty.consuming).mul(td)
            .add(new BigNumber(qty.previous_consuming).mul(td))
            .add(a ? a.consumed : 0).toNumber(),
          since: a && a.since > start ? a.since : start
        };
      }).toString(),

      aggregate: ((a, prev, curr, aggTwCell, accTwCell) => {
        // Usage was rejected by accumulate
        if (!curr)
          return a;

        const consuming = new BigNumber(curr.consuming)
          .sub(prev ? prev.consuming : 0);
        const consumed = new BigNumber(curr.consumed)
          .sub(prev ? prev.consumed : 0);
        return {
          consuming: consuming.add(a ? a.consuming : 0).toNumber(),
          consumed: consumed.add(a ? a.consumed : 0).toNumber()
        };
      }).toString(),

      summarize: ((t, qty, from, to) => {
        // no usage
        if (!qty)
          return 0;
        // Apply stop on running instance
        const rt = Math.min(t, to ? to : t);
        const past = from - rt;
        const future = to - rt;
        const td = past + future;
        const consumed = new BigNumber(qty.consuming)
          .mul(-1).mul(td).toNumber();
        return new BigNumber(qty.consumed).add(consumed)
          .div(2).div(3600000).toNumber();
      }).toString()
    }]
};

