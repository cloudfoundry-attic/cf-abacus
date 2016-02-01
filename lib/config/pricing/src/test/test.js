'use strict';

// Provides access to pricing plans.

const config = require('..');

describe('abacus-pricing-config', () => {
  it('returns pricing plan given a pricing plan id', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 2) done();
    };

    // Retrieve a pricing plan
    config.plan('test-pricing-basic', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal(require('./test-pricing-basic'));
      cb();
    })

    // Retrieve it again, this time it should be returned from the cache
    config.plan('test-pricing-basic', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal(require('./test-pricing-basic'));
      cb();
    })
  });

  it('returns a pricing_plan_id', (done) => {
    const expected = {
      pricing_plan_id: 'test-pricing-basic',
      pricing_metrics: [
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

    let cbs = 0;
    const cb = () => {
      if (++cbs === 2) done();
    };

    // Retrieve a pricing plan id
    config.id('test-org', 'test-resource', 'test-plan', 'USA', 0, undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal(expected);
        cb();
      });

    // Retrieve it again, this time it should be returned from the cache
    config.id('test-org', 'test-resource', 'test-plan', 'USA', 0, undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal(expected);
        cb();
      });
  });
});
