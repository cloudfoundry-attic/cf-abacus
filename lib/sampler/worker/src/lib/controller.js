'use strict';

const moment = require('abacus-moment');
const { map } = require('underscore');
const debug = require('abacus-debug')('abacus-sampler-worker');

class Controller {
  constructor(opts) {
    this.dao = opts.spanDAO;
    this.cleanupBatchOffset = opts.cleanupBatchOffset;
    this.cleanupBatchSize = opts.cleanupBatchSize;
    this.cleanupAge = opts.cleanupAge;
  }

  async cleanupSpans() {
    const before = moment.utc().subtract(this.cleanupAge, 'ms').valueOf();
    const spans = await this.dao.findCompleteSpans(
      before,
      this.cleanupBatchOffset,
      this.cleanupBatchSize
    );
    const ids = map(spans, (span) => span._id);
    if (ids.length > 0) {
      debug('cleaning up %d spans', ids.length);
      await this.dao.deleteSpansByIDs(ids);
    }
  }
}

module.exports = {
  Controller
};
