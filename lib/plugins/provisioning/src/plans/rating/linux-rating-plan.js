'use strict';

// A sample container service rated by memory consumption over time

/* istanbul ignore file */

module.exports = {
  plan_id: 'linux-rating-plan',
  metrics: [
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
