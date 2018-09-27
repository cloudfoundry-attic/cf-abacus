'use strict';

/* eslint-disable nodate/no-moment, nodate/no-new-date, nodate/no-date */

const moment = require('moment');

const offset =
  process.env.ABACUS_TIME_OFFSET
    ? moment.duration(JSON.parse(process.env.ABACUS_TIME_OFFSET)).as('milliseconds')
    : 0;

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
  const time = new Date(period * 86400000);
  return time.getUTCFullYear() * 100 + time.getUTCMonth() + 1;
};

//
// Returns a timestamp (in milliseconds since epoch), at the specified
// year, month, day, hour, minute, second, and milliseconds.
//
moment.utcTimestamp = (year, month, day, hour, minute, second, millis) => {
  return moment.utc([year, month, day, hour, minute, second, millis]).valueOf();
};

moment.Jan = 0;
moment.Feb = 1;
moment.Mar = 2;
moment.Apr = 3;
moment.May = 4;
moment.Jun = 5;
moment.Jul = 6;
moment.Aug = 7;
moment.Sep = 8;
moment.Oct = 9;
moment.Nov = 10;
moment.Dec = 11;

module.exports = moment;
