
'use strict';
const moment = require('abacus-moment');
const yieldable = require('abacus-yieldable');

const oneMinuteInMills = 60 * 1000;
const scheduleInterval = 1000;

module.exports = (threshold = oneMinuteInMills) => {

  let executionStart;

  const until = (check, cb) => {
    const checkCallbackFn = yieldable.functioncb(check);
    checkCallbackFn((err, result) => {
      if (moment.now() - executionStart > threshold)
        cb(new Error('Execution exited with timeout'));

      if (err || !result)
        setTimeout(() => until(check, cb), scheduleInterval);
      else
        cb();
    });
  };

  return {
    until: (check, cb) => {
      executionStart = moment.now();
      until(check, cb);
    }
  };
};
