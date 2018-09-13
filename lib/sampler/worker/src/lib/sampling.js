'use strict';

const moment = require('abacus-moment');

class Sampler {
  constructor(dimension) {
    this.dimension = dimension;
  }

  calculateNextIntervalEnd(lastIntervalEnd, spanEnd = undefined) {
    if (!spanEnd)
      return moment.utc(lastIntervalEnd).startOf(this.dimension).add(1, this.dimension).valueOf();

    if (lastIntervalEnd === spanEnd)
      return lastIntervalEnd;

    if (spanEnd < lastIntervalEnd) {
      if (this._areInSameWindowGoingBackward(lastIntervalEnd, spanEnd))
        return spanEnd;
      return moment.utc(lastIntervalEnd).subtract(1, 'ms').startOf(this.dimension).valueOf();
    }

    if (this._areInSameWindowGoingForward(lastIntervalEnd, spanEnd))
      return spanEnd;
    return moment.utc(lastIntervalEnd).startOf(this.dimension).add(1, this.dimension).valueOf();
  }

  _areInSameWindowGoingForward(lastIntervalEnd, spanEnd) {
    const lastIntervalEndWindow = moment.utc(lastIntervalEnd).startOf(this.dimension).valueOf();
    const spanEndWindow = moment.utc(spanEnd).startOf(this.dimension).valueOf();
    return lastIntervalEndWindow === spanEndWindow;
  }

  // An important remark: windows work in a strange way when going backward (when
  // doing a negative correction). Please consult this code's test file for a
  // more detailed explanation.
  _areInSameWindowGoingBackward(lastIntervalEnd, spanEnd) {
    const lastIntervalEndWindow = moment.utc(lastIntervalEnd).subtract(1, 'ms').startOf(this.dimension).valueOf();
    const spanEndWindow = moment.utc(spanEnd).subtract(1, 'ms').startOf(this.dimension).valueOf();
    return lastIntervalEndWindow === spanEndWindow;
  }
}

module.exports = {
  Sampler
};
