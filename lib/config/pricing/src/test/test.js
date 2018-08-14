'use strict';

// Disable batch, retry and breaker
require('abacus-batch');
require.cache[require.resolve('abacus-batch')].exports = (fn) => fn;
require('abacus-retry');
require.cache[require.resolve('abacus-retry')].exports = (fn) => fn;
require('abacus-breaker');
require.cache[require.resolve('abacus-breaker')].exports = (fn) => fn;

// Mock the request module
const request = require('abacus-request');
const { extend } = require('underscore');
let getspy;
const reqmock = extend({}, request, {
  get: (uri, opts, cb) => getspy(uri, opts, cb)
});
require.cache[require.resolve('abacus-request')].exports = reqmock;
getspy = (uri, opts, cb) => {
  // Expect a call to the provisioning service's validate
  if (uri === 'http://localhost:9880/v1/pricing/plans/:pricing_plan_id') {
    if (opts.pricing_plan_id === 'notFound')
      return cb(undefined, {
        statusCode: 404,
        body: 'not found',
        headers: {
          'www-authenticate': 'test'
        }
      });
    if (opts.pricing_plan_id === 'test-get-plan')
      return cb(undefined, {
        statusCode: 200,
        body: require('./test-pricing-basic')
      });
    return cb('error', undefined);
  }

  if (uri === 'http://localhost:9881/v1/pricing/organizations/:organization_id/resource_types/' +
    ':resource_type/plans/:plan_id/time/:time/pricing_plan/id'
  ) {
    expect(opts.resource_type).to.equal('test-id');
    return cb(undefined, {
      statusCode: 200,
      body: 'test-id'
    });
  }

  return cb('unknown request');
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
        reason: 'Pricing plan with id notFound not found',
        cause: {
          statusCode: 404,
          body: 'not found',
          headers: {
            'www-authenticate': 'test'
          }
        }
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
    config.id(
      'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      'test-resource',
      'test-plan',
      1420070400000,
      undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal({
          pricing_plan_id: 'test-pricing-basic'
        });
        cb();
      }
    );

    // Retrieve it again, this time it should be returned from the cache
    config.id(
      'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      'test-resource',
      'test-plan',
      1420070400000,
      undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal({
          pricing_plan_id: 'test-pricing-basic'
        });
        cb();
      }
    );

    // Make call to account
    config.id('a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', 'test-id', 'test-id', 1420070400000, undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal({
        pricing_plan_id: 'test-id'
      });
      cb();
    });
  });

  it('returns with the appropriate error flag and reason', (done) => {
    // Mock request to simulate business error
    getspy = (uri, opts, cb) => cb(undefined, { statusCode: 404, body: 'Not found' });

    // When the plan id does not map to a plan
    config.id(
      'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      'InvalidResourceType',
      'test-plan',
      1420070400000,
      undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal({
          error: 'eppidnotfound',
          reason: 'Pricing plan id for resource type ' + 'InvalidResourceType and plan id test-plan not found',
          cause: {
            statusCode: 404,
            body: 'Not found'
          }
        });
        done();
      }
    );
  });
});
