'use strict';

const _ = require('underscore');
const extend = _.extend;

const statistics = {
  usage: {
    missingToken: 0,
    reportFailures: 0,
    reportSuccess: 0,
    reportConflict: 0,
    reportBusinessError: 0,
    loopFailures: 0,
    loopSuccess: 0,
    loopConflict: 0,
    loopSkip: 0
  },
  carryOver: {
    getSuccess: 0,
    getNotFound: 0,
    getFailure: 0,
    removeSuccess: 0,
    removeFailure: 0,
    upsertSuccess: 0,
    upsertFailure: 0,
    readSuccess: 0,
    readFailure: 0,
    docsRead: 0
  },
  paging: {
    missingToken: 0,
    pageReadSuccess: 0,
    pageReadFailures: 0,
    pageProcessSuccess: 0,
    pageProcessFailures: 0,
    pageProcessEnd: 0
  }
};

const buildStatistics = (predefined) => {
  return extend({}, statistics, predefined);
};

module.exports = buildStatistics;
