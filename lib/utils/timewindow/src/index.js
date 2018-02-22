'use strict';

const _ = require('underscore');
const moment = require('abacus-moment');

const map = _.map;
const rest = _.rest;
const each = _.each;

const sec = 's';
const min = 'm';
const hour = 'h';
const day = 'D';
const month = 'M';

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

// Time dimension keys as constants
const timeDimension = {
  sec,
  min,
  hour,
  day,
  month
};

// Time dimension keys corresponding to their respective window positions
const dimensions = [sec, min, hour, day, month];

// Used to calculate time windows based on slack size
const slackscale = {
  [month]: { [month]: 1 },
  [day]: { [month]: 28, [day]: 1 },
  [hour]: { [month]: 672, [day]: 24, [hour]: 1 },
  [min]: { [month]: 40320, [day]: 1440, [hour]: 60, [min]: 1 },
  [sec]: { [month]: 2419200, [day]: 86400, [hour]: 3600, [min]: 60, [sec]: 1 }
};

const timeWindowsSizes = (slack, windowsSizes) => {
  const slackBasedWindows = (dimension) => {
    if (slack.scale && slackscale[slack.scale][dimension])
      return map(Array(Math.ceil(1 / slackscale[slack.scale][dimension] * slack.width) + 1), () => null);
    return [null];
  };

  return {
    getWindows: (dimension) => {
      if (windowsSizes && windowsSizes[dimension]) return map(Array(windowsSizes[dimension]), () => null);
      return slackBasedWindows(dimension);
    }
  };
};

// Takes a Date or moment.js object and returns a Javascript Date equivalent
// with all dimensions lower than the given one set to 0
const zeroLowerTimeDimensions = (date, dim) => {
  debug('Zeroing out dimensions lower than %s on %s', dim, date);
  return moment
    .utc(date)
    .startOf(shortcut[dim])
    .toDate();
};

// Takes two dates and a dimension, and returns the difference from
// the second date to the first date within that time dimension
const diff = (date1, date2, dim) => {
  debug('Difference between %s and %s in dimension %s', date1, date2, dim);
  return moment
    .utc(date2)
    .startOf(shortcut[dim])
    .diff(moment.utc(date1).startOf(shortcut[dim]), shortcut[dim]);
};

// Returns the index within the windows that the time falls
// under based upon the given current time and time dimension
const timeWindowIndex = (windows, current, time, dim, exceedWindow) => {
  const index = diff(time, current, dim);
  // Return -1 if the calculated index falls outside the window width
  // Return 0 in the case of a negative index
  return exceedWindow ? Math.max(0, index) : index >= windows.length ? -1 : Math.max(0, index);
};

// Takes a timewindow, and adjust its window that is based on date1 to date2
// given that date 1 is farther ahead of date2.
const adjustWindows = (windows, date1, date2) => {
  if (date2 > date1) return windows;
  return map(dimensions, (dim, i) => {
    const index = timeWindowIndex(windows[i], date1, date2, dim, true);
    // Leave window as it is if the length is too far
    return rest(windows[i], index < windows[i].length ? index : 0);
  });
};

// Return the start and end bounds of a time window to given dimension
// The window can optionally be shifted
const timeWindowBounds = (date, dim, shift) => {
  // Zero out the lower time dimensions
  const bound = moment.utc(zeroLowerTimeDimensions(date, dim));

  /* eslint-disable nodate/no-moment-without-utc */

  // Get the from bound based on the optional shift parameter
  bound.add(shift || 0, shortcut[dim]);
  const from = moment(bound.valueOf()).toDate();

  // Get the to bound based on being 1 more than from in the current dimension
  bound.add(1, shortcut[dim]);
  const to = moment(bound.valueOf()).toDate();

  /* eslint-enable nodate/no-moment-without-utc */

  return {
    from: from,
    to: to
  };
};

// Shift the time windows by the difference in windows per dimension
const shiftWindow = (before, after, twindow, dim) => {
  map(Array(Math.max(0, Math.min(twindow.length, diff(before, after, dim)))), () => {
    twindow.unshift(null);
    twindow.pop();
  });
};

// a function that gives the value of the submitted usage in the
// dimension window.
const cellfn = (timeWindow, processed, usageTime) => {
  return (dimension) => {
    const index = timeWindowIndex(
      timeWindow[dimensions.indexOf(dimension)],
      moment.utc(processed).toDate(),
      moment.utc(usageTime).toDate(),
      dimensions[dimensions.indexOf(dimension)]
    );

    return timeWindow[dimensions.indexOf(dimension)][index];
  };
};

const shiftResources = (resources, oldend, newend) => {
  const shiftAggregatedUsage = (aggregated) => {
    each(aggregated, (au) => {
      each(au.windows, (w, i) => {
        shiftWindow(oldend, newend, w, dimensions[i]);
      });
    });
  };

  each(resources, (resource) => {
    each(resource.plans, (plan) => {
      shiftAggregatedUsage(plan.aggregated_usage);
    });
  });
};

const shift = (updateDoc, doc, processed) => {
  if (doc && doc.processed && processed - doc.processed >= 0) {
    const oldend = doc.processed;
    const newend = processed;

    shiftResources(updateDoc.resources, oldend, newend);
    each(updateDoc.spaces, (space) => {
      shiftResources(space.resources, oldend, newend);
    });
  }
};

const isDimensionSupported = (dimension) => {
  return [day, month].includes(dimension);
};

module.exports.zeroLowerTimeDimensions = zeroLowerTimeDimensions;
module.exports.diff = diff;
module.exports.timeWindowIndex = timeWindowIndex;
module.exports.timeWindowBounds = timeWindowBounds;
module.exports.shiftWindow = shiftWindow;
module.exports.cellfn = cellfn;
module.exports.adjustWindows = adjustWindows;
module.exports.dimension = timeDimension;
module.exports.dimensions = dimensions;
module.exports.timeWindowsSizes = timeWindowsSizes;
module.exports.shift = shift;
module.exports.isDimensionSupported = isDimensionSupported;
