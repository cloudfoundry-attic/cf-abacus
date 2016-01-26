'use strict';

// Provides access to resource pricing configuration.

const config = require('..');
const configId = config.configId;

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
    const u = {
      organization_id: 'testOrg',
      resource_type: 'test-resource',
      plan_id: 'testPlan',
      pricing_country: 'USA',
      time: 0
    };

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

    // Retrieve a rating plan id
    configId(u, undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal(expected);
      cb();
    });

    // Retrieve it again, this time it should be returned from the cache
    configId(u, undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal(expected);
      cb();
    });
  });
});
