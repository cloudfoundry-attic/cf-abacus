'use strict';

// Utilities for time
const moment = require('moment');
const _ = require('underscore');
const map = _.map;

// Setup debug log
const debug = require('abacus-debug')('abacus-timewindow');

// Mapping from time window shortcuts to moment.js shortcuts
const shortcut = {
  Y: 'y',
  W: 'w',
  M: 'M',
  D: 'd',
  h: 'h',
  m: 'm',
  s: 's'
};

// Time dimension keys corresponding to their respective window positions
const dimensions = ['s', 'm', 'h', 'D', 'M'];

// Takes a Date or moment.js object and returns a Javascript Date equivalent
// with all dimensions lower than the given one set to 0
const zeroLowerTimeDimensions = (date, dim) => {
  debug('Zeroing out dimensions lower than %s on %s', dim, date);
  return moment.utc(date).startOf(shortcut[dim]).toDate();
};

// Takes two dates and a dimension, and returns the difference from
// the second date to the first date within that time dimension
const diff = (date1, date2, dim) => {
  debug('Difference between %s and %s in dimension %s', date1, date2, dim);
  return moment.utc(date2).startOf(shortcut[dim])
    .diff(moment.utc(date1).startOf(shortcut[dim]), shortcut[dim]);
};

// Returns the index within the windows that the time falls
// under based upon the given current time and time dimension
const timeWindowIndex = (windows, current, time, dim, exceedWindow) => {
  const index = diff(time, current, dim);
  // Return -1 if the calculated index falls outside the window width
  // Return 0 in the case of a negative index
  return exceedWindow ? Math.max(0, index) :
    index >= windows.length ? -1 : Math.max(0, index);
};

// Return the start and end bounds of a time window to given dimension
// The window can optionally be shifted
const timeWindowBounds = (date, dim, shift) => {
  // Zero out the lower time dimensions
  const bound = moment.utc(zeroLowerTimeDimensions(date, dim));

  // Get the from bound based on the optional shift parameter
  bound.add(shift || 0, shortcut[dim]);
  const from = new Date(bound.valueOf());

  // Get the to bound based on being 1 more than from in the current dimension
  bound.add(1, shortcut[dim]);
  const to = new Date(bound.valueOf());

  return {
    from: from,
    to: to
  };
};

// Shift the time windows by the difference in windows per dimension
const shiftWindow = (before, after, twindow, dim) => {
  map(Array(Math.max(0,
  Math.min(twindow.length, diff(before, after, dim)))), () => {
    twindow.unshift(null);
    twindow.pop();
  });
};

// a function that gives the value of the submitted usage in the
// dimension window.
const cellfn = (timeWindow, processed, usageTime) => {
  return (dimension) => {
    const index = timeWindowIndex(timeWindow[dimensions.
      indexOf(dimension)], new Date(processed), new Date(usageTime),
      dimensions[dimensions.indexOf(dimension)]);
    
    return timeWindow[dimensions.indexOf(dimension)][index] &&
      timeWindow[dimensions.indexOf(dimension)][index].quantity;
  };
};

module.exports.zeroLowerTimeDimensions = zeroLowerTimeDimensions;
module.exports.diff = diff;
module.exports.timeWindowIndex = timeWindowIndex;
module.exports.timeWindowBounds = timeWindowBounds;
module.exports.shiftWindow = shiftWindow;
module.exports.cellfn = cellfn;
