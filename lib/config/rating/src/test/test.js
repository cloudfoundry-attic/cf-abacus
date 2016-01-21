'use strict';

// Provides access to resource metering and aggregation configuration.

const config = require('..');

describe('abacus-rating-config', () => {
  it('returns rate config for a resource', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 2) done();
    };

    // Retrieve a resource config
    config('basic-test-rating-plan', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.source).to.deep.equal(require('./basic-test-rating-plan.js'));
      cb();
    });

    // Retrieve it again, this time it should be returned from the cache
    config('basic-test-rating-plan', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.source).to.deep.equal(require('./basic-test-rating-plan.js'));
      cb();
    });
  });
});
