'use strict';
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

module.exports = { 
  jan1Day, jan1Month, jan2Day, jan2Month, febDay, febMonth
};
