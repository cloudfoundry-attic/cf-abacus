'use strict';

// A test resource metered by max storage, API calls, and memory consumption
// over time

/* istanbul ignore file */

module.exports = {
  plan_id: 'test-rating-plan',
  metrics: [
    {
      name: 'storage',
      rate: ((price, qty) => new BigNumber(price || 0)
        .mul(qty).toNumber()).toString()
    },
    {
      name: 'thousand_light_api_calls',
      charge: ((t, cost) => cost ? cost : 0).toString()
    },
    {
      name: 'heavy_api_calls',
      rate: ((price, qty) => new BigNumber(qty)
        .mul(price || 0).toNumber()).toString()
    },
    {
      name: 'memory',
      // Simply pass in the price because
      // the unit is not in memory consumption over time yet
      rate: ((price, qty) => ({
        price: price,
        consuming: qty.consuming,
        consumed: qty.consumed
      })).toString(),

      charge: ((t, qty, from, to) => {
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
        const gbhour = new BigNumber(qty.consumed)
          .add(consumed).div(2).div(3600000).toNumber();
        return new BigNumber(gbhour).mul(qty.price).toNumber();
      }).toString()
    }
  ]
};
