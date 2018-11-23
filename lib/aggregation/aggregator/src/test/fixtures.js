'use strict';

const { buildAccumulatedUsage } = require('./templates');  

// const octDay = {
//   quantity: {
//     current: { consumed: 172800000, consuming: 2, since: 1446249600000 }
//   },
//   cost: { consumed: 172800000, consuming: 2, price: 0.00014 }
// };
// const octMonth = {
//   quantity: {
//     current: { consumed: -5011200000, consuming: 2, since: 1446249600000 }
//   },
//   cost: { consumed: -5011200000, consuming: 2, price: 0.00014 }
// };
// const nov1Day = {
//   quantity: {
//     current: { consumed: 172800000, consuming: 2, since: 1446336000000 }
//   },
//   cost: { consumed: 172800000, consuming: 2, price: 0.00014 }
// };
// const nov1Month = {
//   quantity: {
//     current: { consumed: 5184000000, consuming: 2, since: 1446336000000 }
//   },
//   cost: { consumed: 5184000000, consuming: 2, price: 0.00014 }
// };
// const nov2Day = {
//   quantity: {
//     previous: { consumed: 172800000, consuming: 2, since: 1446336000000 },
//     current: { consumed: 72000000, consuming: 1, since: 1446422400000 }
//   },
//   cost: { consumed: 72000000, consuming: 1, price: 0.00014 }
// };
// const nov2Month = {
//   quantity: {
//     previous: { consumed: 5184000000, consuming: 2, since: 1446336000000 },
//     current: { consumed: 2750400000, consuming: 1, since: 1446422400000 }
//   },
//   cost: { consumed: 2750400000, consuming: 1, price: 0.00014 }
// };

const jan1Day = {
  quantity: {
    current: { consumed: 172800000, consuming: 2, since: 1454198400000 }
  }
};
const jan1Month = {
  quantity: {
    current: { consumed: -5011200000, consuming: 2, since: 1454198400000 }
  }
};
const jan2Day = {
  quantity: {
    previous: { consumed: 172800000, consuming: 2, since: 1454198400000 },
    current: { consumed: 144000000, consuming: 1, since: 1454227200000 }
  }
};
const jan2Month = {
  quantity: {
    previous: { consumed: -5011200000, consuming: 2, since: 1454198400000 },
    current: { consumed: -2448000000, consuming: 1, since: 1454227200000 }
  }
};
const febDay = {
  quantity: {
    current: { consumed: 115200000, consuming: 2, since: 1454299200000 }
  }
};
const febMonth = {
  quantity: {
    current: { consumed: 4953600000, consuming: 2, since: 1454299200000 }
  }
};

const usagesForCorrectWindows = [
  buildAccumulatedUsage('bounds', 1454198400000, 1454198400000, 1454198400000),
  buildAccumulatedUsage('bounds', 1454227200000, 1454227200000, 1454313600000),
  buildAccumulatedUsage('bounds', 1454299200000, 1454299200000, 1454313600000)
];
usagesForCorrectWindows[0].accumulated_usage = [
  {
    metric: 'memory',
    windows: [[null], [null], [null], [jan1Day, null, null], [jan1Month, null]]
  }
];
usagesForCorrectWindows[1].accumulated_usage = [
  {
    metric: 'memory',
    windows: [[null], [null], [null], [null, jan2Day, null], [null, jan2Month]]
  }
];
usagesForCorrectWindows[2].accumulated_usage = [
  {
    metric: 'memory',
    windows: [[null], [null], [null], [febDay, jan2Day, null], [febMonth, jan2Month]]
  }
];

const expectedForCorrectWindows = [
  [null],
  [null],
  [null],
  [
    {
      quantity: { consuming: 2, consumed: 115200000 },
      previous_quantity: null
    },
    null,
    null
  ],
  [
    {
      quantity: { consuming: 2, consumed: 4953600000 },
      previous_quantity: null
    },
    null
  ]
];

const correctWindowsTestFixtures = {
  usage: usagesForCorrectWindows,
  expected: expectedForCorrectWindows
};

const usagesForShiftWindow = [
  buildAccumulatedUsage('bounds', 1461974400000, 1461974400000, 1461974400000),
  buildAccumulatedUsage('bounds', 1461974400000, 1461974400000, 1461974400000),
  buildAccumulatedUsage('bounds', 1462060800000, 1462060800000, 1462060800000)
];
const body = () => ({
  metric: 'heavy_api_calls',
  windows: [
    [null],
    [null],
    [null],
    [{ quantity: { current: 500 } }, null, null],
    [{ quantity: { current: 500 } }, null]
  ]
});
usagesForShiftWindow[0].accumulated_usage = [body()];
usagesForShiftWindow[1].accumulated_usage = [body()];
usagesForShiftWindow[2].accumulated_usage = [body()];
usagesForShiftWindow[1].plan_id = 'standard';

// Expected values for the different levels of aggregation
const expectedForShiftWindow = {
  metric: 'heavy_api_calls',
  windows: [
    [null],
    [null],
    [null],
    [{ quantity: 500, previous_quantity: null }, null, null],
    [{ quantity: 500, previous_quantity: null }, null]
  ]
};

const shiftWindowsTestFixtures = {
  usage: usagesForShiftWindow,
  expected: expectedForShiftWindow
};

module.exports = { 
  correctWindowsTestFixtures, shiftWindowsTestFixtures
};
