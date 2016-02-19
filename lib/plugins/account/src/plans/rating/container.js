'use strict';

// A sample container service metered by memory consumption over time

// This algorithm works with any out of order app usage events happening 
// between beginning of time(past) and end of time(future). 

// An app that comsumes memory 'borrows' from the memory bank. An app
// consumes memory in the past before it is stopped/updated, or in the
// future after it is started. In this case, we substract memory from the
// memory bank.

// An app that does not consume memory 'returns' to the memory bank. An
// app does not consumes memory in the past before it is started, or in
// the future after it is stopped. In this case, we add memory to the 
// memory bank.

// Using this algorithm, the order of operations is not relevant to the
// calculation of consumed memory between big bang and apocalypse.

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

