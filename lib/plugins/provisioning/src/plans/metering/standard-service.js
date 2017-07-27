'use strict';

/* istanbul ignore file */

module.exports = {
  plan_id: 'standard-service',
  measures: [
    {
      name: 'current_instances',
      unit: 'NUMBER'
    },
    {
      name: 'previous_instances',
      unit: 'NUMBER'
    }],
  metrics: [{
    name: 'instances',
    unit: 'NUMBER',
    type: 'time-based',

    meter: ((m) => ({
      previous_consuming: new BigNumber(m.previous_instances || 0)
        .mul(-1).toNumber(),
      consuming: new BigNumber(m.current_instances || 0).toNumber()
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
