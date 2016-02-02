'use strict';

// Provides access to rating plans

const config = require('..');

describe('abacus-rating-config', () => {
  it('returns rating plan given the rating plan id', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 2) done();
    };

    // Retrieve a rating plan
    config.plan('basic-test-rating-plan', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.source).to.deep.equal(require('./basic-test-rating-plan.js'));
      cb();
    });

    // Retrieve it again, this time it should be returned from the cache
    config.plan('basic-test-rating-plan', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.source).to.deep.equal(require('./basic-test-rating-plan.js'));
      cb();
    });
  });

  it('returns a rating plan id', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 2) done();
    };

    // Retrieve a rating plan id
    config.id('test-org', 'test-resource', 'test-plan', 0, undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.equal('basic-test-rating-plan');
        cb();
      });

    // Retrieve it again, this time it should be returned from the cache
    config.id('test-org', 'test-resource', 'test-plan', 0, undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.equal('basic-test-rating-plan');
        cb();
      });
  });
});
