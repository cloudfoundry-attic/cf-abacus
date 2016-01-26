'use strict';

// Provides access to resource metering and aggregation configuration.

const config = require('..');
const configId = config.configId;

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
    const u = {
      organization_id: 'testOrg',
      resource_type: 'test-resource',
      plan_id: 'testPlan',
      time: 0
    }

    let cbs = 0;
    const cb = () => {
      if (++cbs === 2) done();
    };

    // Retrieve a rating plan id
    configId(u, undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal({ rating_plan_id: 'basic-test-rating-plan' });
      cb();
    });

    // Retrieve it again, this time it should be returned from the cache
    configId(u, undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal({ rating_plan_id: 'basic-test-rating-plan' });
      cb();
    });
  });
});
