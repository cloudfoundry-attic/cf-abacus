'use strict';

/* istanbul ignore file */

module.exports = {
  plan_id: 'service-rating-standard',
  metrics: [
    {
      name: 'instances',

      rate: ((price, qty) => ({
        price: price,
        consuming: qty.consuming,
        consumed: qty.consumed
      })).toString(),

      charge: ((t, qty, from, to) => {
        // no usage
        if (!qty || !qty.price)
          return 0;
        // Apply stop on running instance
        const rt = Math.min(t, to ? to : t);
        const past = from - rt;
        const future = to - rt;
        const td = past + future;
        const consumed = new BigNumber(qty.consuming)
          .mul(-1).mul(td).toNumber();
        const serviceHour = new BigNumber(qty.consumed)
          .add(consumed).div(2).div(3600000).toNumber();
        return new BigNumber(serviceHour).mul(qty.price).toNumber();
      }).toString()
    }]
};
