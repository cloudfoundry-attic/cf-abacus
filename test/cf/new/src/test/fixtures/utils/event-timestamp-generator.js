
'use strict';

const moment = require('abacus-moment');

module.exports = function *(startMinutesAgo = 0) {
  const now = moment.now();
  let currentEventTimestamp = moment
    .utc(now)
    .subtract(startMinutesAgo, 'minutes')
    .valueOf();

  while (true)
    yield currentEventTimestamp++;
};
