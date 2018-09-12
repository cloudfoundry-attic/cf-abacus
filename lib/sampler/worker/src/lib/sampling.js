'use strict';

const moment = require('abacus-moment');

// An important remark: windows work in a strange way when going backward (when
// doing a negative correction). Please consult this code's test file for a
// more detailed explanation.

const areInSameWindowGoingForward = (dimension, lastIntervalEnd, spanEnd) => {
  const lastIntervalEndWindow = moment.utc(lastIntervalEnd).startOf(dimension).valueOf();
  const spanEndWindow = moment.utc(spanEnd).startOf(dimension).valueOf();
  return lastIntervalEndWindow === spanEndWindow;
};

const areInSameWindowGoingBackward = (dimension, lastIntervalEnd, spanEnd) => {
  const lastIntervalEndWindow = moment.utc(lastIntervalEnd).subtract(1, 'ms').startOf(dimension).valueOf();
  const spanEndWindow = moment.utc(spanEnd).subtract(1, 'ms').startOf(dimension).valueOf();
  return lastIntervalEndWindow === spanEndWindow;
};

const calculateNextIntervalEnd = (dimension, lastIntervalEnd, spanEnd = undefined) => {
  if (!spanEnd)
    return moment.utc(lastIntervalEnd).startOf(dimension).add(1, dimension).valueOf();

  if (lastIntervalEnd === spanEnd)
    return lastIntervalEnd;

  if (spanEnd < lastIntervalEnd) {
    if (areInSameWindowGoingBackward(dimension, lastIntervalEnd, spanEnd))
      return spanEnd;
    return moment.utc(lastIntervalEnd).subtract(1, 'ms').startOf(dimension).valueOf();
  }

  if (areInSameWindowGoingForward(dimension, lastIntervalEnd, spanEnd))
    return spanEnd;
  return moment.utc(lastIntervalEnd).startOf(dimension).add(1, dimension).valueOf();
};

module.exports = {
  calculateNextIntervalEnd
};
