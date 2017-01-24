'use strict';

/* eslint-disable nodate/nomoment, nodate/nonewdate, nodate/nodate */

const moment = require('moment');
let offset = 0;
if (process.env.ABACUS_TIME_OFFSET) {
  offset = parseInt(process.env.ABACUS_TIME_OFFSET);
  console.log('Configured time offest: %s', offset);
}

moment.now = () => {
  return +new Date() + offset;
};

//
// Convert a period (# of days since Jan 1, 1970) to a YYYYMM date
//
// We intentionally do not use moment since the implementation below is
// much faster (factor of 10) due to native Date implementation
//
moment.toYYYYMM = (period) => {
  const time = new Date(period * 86400000 + offset);
  return time.getUTCFullYear() * 100 + time.getUTCMonth() + 1;
};

module.exports = moment;
