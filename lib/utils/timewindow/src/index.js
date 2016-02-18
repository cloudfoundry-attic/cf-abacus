'use strict';

// Utilities for time
const _ = require('underscore');

const map = _.map;

// Setup debug log
const debug = require('abacus-debug')('abacus-timewindow');

// Millisecond representation of higher time dimensions up to a day
const dateInMilliseconds = 86400000;
const hoursInMilliseconds = 3600000;
const minutesInMilliseconds = 60000;
const secondsInMilliseconds = 1000;


// Takes a Date object and returns an equivalent with all lower dimensions
// of time specified zeroed out
const zeroLowerTimeDimensions = (date, dim) => {
  debug('Zeroing out dimensions lower than %s on %s', dim, date);
  const dims = {
    M: 5,
    D: 4,
    h: 3,
    m: 2,
    s: 1
  };
  return new Date(Date.UTC.apply(null, [
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds()
  ].slice(0, 7 - (dims[dim] ? dims[dim] : 0))));
};

// Returns the difference in months between the two times while ignoring
// any lower dimension of time
const monthWindowDiff = (date1, date2) => {
  debug('Calculating month window diff between %s and %s', date1, date2);
  return (date2.getUTCFullYear() - date1.getUTCFullYear()) * 12
    - date1.getUTCMonth() + date2.getUTCMonth();
};

// Returns the difference in dates between the two times while ignoring
// any lower dimension of time
const dateWindowDiff = (date1, date2) => {
  debug('Calculating date window diff between %s and %s', date1, date2);
  return (zeroLowerTimeDimensions(date2, 'D')
    - zeroLowerTimeDimensions(date1, 'D')) / dateInMilliseconds;
};

// Returns the difference in dates between the two times while ignoring
// any lower dimension of time
const hoursWindowDiff = (date1, date2) => {
  debug('Calculating hours window diff between %s and %s', date1, date2);
  return (zeroLowerTimeDimensions(date2, 'h')
    - zeroLowerTimeDimensions(date1, 'h')) / hoursInMilliseconds;
};

// Returns the difference in dates between the two times while ignoring
// any lower dimension of time
const minutesWindowDiff = (date1, date2) => {
  debug('Calculating minutes window diff between %s and %s', date1, date2);
  return (zeroLowerTimeDimensions(date2, 'm')
    - zeroLowerTimeDimensions(date1, 'm')) / minutesInMilliseconds;
};

// Returns the difference in dates between the two times while ignoring
// any lower dimension of time
const secondsWindowDiff = (date1, date2) => {
  debug('Calculating seconds window diff between %s and %s', date1, date2);
  return (zeroLowerTimeDimensions(date2, 's')
    - zeroLowerTimeDimensions(date1, 's')) / secondsInMilliseconds;
};

// Mapping of dimension string with their respective diff function
const diffs = {
  M: monthWindowDiff,
  D: dateWindowDiff,
  h: hoursWindowDiff,
  m: minutesWindowDiff,
  s: secondsWindowDiff
};

// Returns the index within the windows that the time falls
// under based upon the given current time and time dimension
const timeWindowIndex = (windows, current, time, dim, exceedWindow) => {
  const index = diffs[dim](time, current);
  // Return -1 if the calculated index falls outside the window width
  // Return 0 in the case of a negative index
  return exceedWindow ? Math.max(0, index) :
    index >= windows.length ? -1 : Math.max(0, index);
};

// Return the start and end bounds of a time window to given dimension
// The window can optionally be shifted
const timeWindowBounds = (date, dimension, shift) => {
  // Object containing the ability to shift a date based on the dimension
  const windowShift = {
    M: (d, t) => d.setUTCMonth(d.getUTCMonth() + (t || 0)),
    D: (d, t) => d.setUTCDate(d.getUTCDate() + (t || 0)),
    h: (d, t) => d.setUTCHours(d.getUTCHours() + (t || 0)),
    m: (d, t) => d.setUTCMinutes(d.getUTCMinutes() + (t || 0)),
    s: (d, t) => d.setUTCSeconds(d.getUTCSeconds() + (t || 0))
  };

  // Copy the date to prevent modifying the passed in parameter
  const boundDate = new Date(date.getTime());
  windowShift[dimension](boundDate, shift || 0);
  const from = zeroLowerTimeDimensions(boundDate, dimension);
  windowShift[dimension](boundDate, 1);
  const to = zeroLowerTimeDimensions(boundDate, dimension);
  return {
    from: from,
    to: to
  };
};

// Shift the time windows by the difference in windows per dimension
const shiftWindow = (before, after, twindow, dimension) => {
  map(Array(Math.max(0,
  Math.min(twindow.length, diffs[dimension](before, after)))), () => {
    twindow.unshift(null);
    twindow.pop();
  });
};

module.exports.zeroLowerTimeDimensions = zeroLowerTimeDimensions;
module.exports.monthWindowDiff = monthWindowDiff;
module.exports.dateWindowDiff = dateWindowDiff;
module.exports.hoursWindowDiff = hoursWindowDiff;
module.exports.minutesWindowDiff = minutesWindowDiff;
module.exports.secondsWindowDiff = secondsWindowDiff;
module.exports.timeWindowIndex = timeWindowIndex;
module.exports.timeWindowBounds = timeWindowBounds;
module.exports.shiftWindow = shiftWindow;

