'use strict';

/* eslint-disable nodate/nomoment, nodate/nonewdate, nodate/nodate */

const moment = require('moment');
const offset = process.env.ABACUS_TIME_OFFSET ?
  parseInt(process.env.ABACUS_TIME_OFFSET) : 0;

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
