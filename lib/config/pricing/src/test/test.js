'use strict';

// Provides access to pricing plans.
const request = require('abacus-request');
const _ = require('underscore');
const extend = _.extend;
// Mock the request module
let getspy;
const reqmock = extend({}, request, {
  batch_get: (reqs, cb) => getspy(reqs, cb)
});
require.cache[require.resolve('abacus-request')].exports = reqmock;
getspy = (reqs, cb) => {
  // Expect a call to the provisioning service's validate
  if(reqs[0][0] ===
    'http://localhost:9880/v1/pricing/plans/:pricing_plan_id') {
    expect(reqs[0][1].pricing_plan_id).to.equal('notFound');
    expect(reqs[1][1].pricing_plan_id).to.equal('test-get-plan');
    cb(undefined, [[undefined, {
      statusCode: 404,
      body: 'not found',
      headers: {
        'www-authenticate': 'test'
      }
    }], [undefined, {
      statusCode: 200,
      body: require('./test-pricing-basic')
    }], ['error', undefined]]);
  }

  if(reqs[0][0] === 'http://localhost:9881' +
    '/v1/pricing/organizations/:organization_id/resource_types/' +
    ':resource_type/plans/:plan_id/time/:time/pricing_plan/id') {
    expect(reqs[0][1].resource_type).to.equal('test-id');
    cb(undefined, [[undefined, {
      statusCode: 200,
      body: 'test-id'
    }]]);
  }
};

const config = require('..');

describe('abacus-pricing-config', () => {
  it('returns pricing plan given a pricing plan id', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 4) done();
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
      expect(val).to.deep.equal({
        pricing_plan: expected
      });
      cb();
    });

    // Retrieve it again, this time it should be returned from the cache
    config.plan('test-pricing-basic', 'USA', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal({
        pricing_plan: expected
      });
      cb();
    });

    // Config not found
    config.plan('notFound', 'USA', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal({
        error: 'epplannotfound',
        reason: 'Pricing plan ' +
          'for the pricing plan id notFound is not found'
      });
      cb();
    });

    // Make call to provision
    config.plan('test-get-plan', 'USA', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal({
        pricing_plan: expected
      });
      cb();
    });
  });

  it('returns a pricing_plan_id', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 3) done();
    };

    // Retrieve a pricing plan id
    config.id('a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      'test-resource', 'test-plan', 1420070400000, undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal({
          pricing_plan_id: 'test-pricing-basic'
        });
        cb();
      });

    // Retrieve it again, this time it should be returned from the cache
    config.id('a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      'test-resource', 'test-plan', 1420070400000, undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal({
          pricing_plan_id: 'test-pricing-basic'
        });
        cb();
      });

    // Make call to account
    config.id(
      'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', 'test-id',
      'test-id', 1420070400000, undefined, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal({
          pricing_plan_id: 'test-id'
        });
        cb();
      });
  });

  it('returns with the appropriate error flag and reason', (done) => {
    // Mock request to simulate business error
    getspy = (reqs, cb) =>
      cb(null, [[undefined, { statusCode: 404, body: 'Not found' }]]);
 
    // When the plan id does not map to a plan
    config.id(
      'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', 'InvalidResourceType',
      'test-plan', 1420070400000, undefined, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal({
          error: 'eppidnotfound',
          reason: 'Unable to find pricing plan id for resource type ' +
            'InvalidResourceType and plan id test-plan'
        });
        done();
      });
  });
});
