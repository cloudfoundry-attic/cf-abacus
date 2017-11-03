
'use strict';

const scheduleInterval = 1000;

const until = (check, cb) => {
  if (!check())
    setTimeout(() => until(check, cb), scheduleInterval);
  else
    cb();
};

module.exports.until = until;
