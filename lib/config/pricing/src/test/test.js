'use strict';

// Provides access to resource pricing configuration.

const config = require('..');
const id = config.id;

describe('abacus-pricing-config', () => {
  it('returns pricing config given the pricing_plan_id', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 2) done();
    };

    // Retrieve a resource config
    config('test-pricing-basic', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal(require('./test-pricing-basic'));
      cb();
    })
    // Retrieve it again, this time it should be returned from the cache
    config('test-pricing-basic', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal(require('./test-pricing-basic'));
      cb();
    })
  });

  it('returns the pricing_plan_id', (done) => {
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
    id('test-org', 'test-resource', 'test-plan', 'USA', 0, undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal(expected);
        cb();
      });

    // Retrieve it again, this time it should be returned from the cache
    id('test-org', 'test-resource', 'test-plan', 'USA', 0, undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal(expected);
        cb();
      });
  });
});
