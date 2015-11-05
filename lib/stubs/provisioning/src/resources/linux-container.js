'use strict';

// A sample container service metered by memory consumption over time

/* istanbul ignore file */

module.exports = {
  resource_id: 'linux-container',
  effective: 1420070400000,
  measures: [
    {
      name: 'instance_memory',
      unit: 'GIGABYTE'
    },
    {
      name: 'running_instances',
      unit: 'NUMBER'
    }],
  metrics: [
    {
      name: 'memory',
      unit: 'GIGABYTE',

      meter: ((m) => ({
        consuming: new BigNumber(m.instance_memory)
          .div(1073741824).mul(m.running_instances).toNumber(),
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
            new BigNumber(a.consuming).mul(Math.max(0, curr.since - a.since))
          ).add(a.consumed).toNumber(),
          consuming: consuming.add(a.consuming).toNumber(),
          since: Math.max(a.since, curr.since)
        } : {
          consumed: 0,
          consuming: consuming.toNumber(),
          since: curr.since
        };

      }).toString(),

      rate: ((price, qty) => ({
        burned: new BigNumber(qty.consumed).mul(price || 0).toNumber(),
        burning: new BigNumber(qty.consuming).mul(price || 0).toNumber(),
        since: qty.since
      })).toString(),

      summarize: ((t, qty) => qty ? new BigNumber(qty.consuming)
        .mul(Math.max(0, t - qty.since)).add(qty.consumed)
        .div(3600000).toNumber() : 0).toString(),

      charge: ((t, cost) => cost ? new BigNumber(cost.burning)
        .mul(Math.max(0, t - cost.since)).add(cost.burned)
        .div(3600000).toNumber() : 0).toString()
    }]
};

