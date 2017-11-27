
'use strict';

const yieldable = require('abacus-yieldable');

const scheduleInterval = 1000;

const until = (check, cb) => {
  const checkCallbackFn = yieldable.functioncb(check);
  checkCallbackFn((err, result) => {
    if (err || !result)
      setTimeout(() => until(check, cb), scheduleInterval);
    else
      cb();
  });
};

module.exports.until = until;
