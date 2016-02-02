'use strict';

// Provides access to pricing plans.

const config = require('..');

describe('abacus-pricing-config', () => {
  it('returns pricing plan given a pricing plan id', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 2) done();
    };
    const expected = {
      metrics: [
        {
          name: 'storage',
          price: 1
        },
        {
          name: 'thousand_light_api_calls',
          price: 0.03
        },
        {
          name: 'heavy_api_calls',
          price: 0.15
        },
        {
          name: 'memory',
          price: 0.00014
        }
      ]
    };

    // Retrieve a pricing plan
    config.plan('test-pricing-basic', 'USA', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal(expected);
      cb();
    })

    // Retrieve it again, this time it should be returned from the cache
    config.plan('test-pricing-basic', 'USA', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal(expected);
      cb();
    })
  });

  it('returns a pricing_plan_id', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 2) done();
    };

    // Retrieve a pricing plan id
    config.id('a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      'test-resource', 'test-plan', 1420070400000, undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.equal('test-pricing-basic');
        cb();
      });

    // Retrieve it again, this time it should be returned from the cache
    config.id('a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      'test-resource', 'test-plan', 1420070400000, undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.equal('test-pricing-basic');
        cb();
      });
  });
});
