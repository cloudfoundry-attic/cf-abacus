'use strict';

// Provides access to resource metering and aggregation configuration.

const config = require('..');
const id = config.id;

describe('abacus-rating-config', () => {
  it('returns rating config given the rating plan id', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 2) done();
    };

    // Retrieve a rating config
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

  it('returns the rating_plan_id', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 2) done();
    };

    // Retrieve a rating plan id
    id('test-org', 'test-resource', 'test-plan', 0, undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal({ rating_plan_id: 'basic-test-rating-plan' });
        cb();
      });

    // Retrieve it again, this time it should be returned from the cache
    id('test-org', 'test-resource', 'test-plan', 0, undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal({ rating_plan_id: 'basic-test-rating-plan' });
        cb();
      });
  });
});
