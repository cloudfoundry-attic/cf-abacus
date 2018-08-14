'use strict';

const { extend } = require('underscore');

// Disable batch, retry and breaker
require('abacus-batch');
require.cache[require.resolve('abacus-batch')].exports = (fn) => fn;
require('abacus-retry');
require.cache[require.resolve('abacus-retry')].exports = (fn) => fn;
require('abacus-breaker');
require.cache[require.resolve('abacus-breaker')].exports = (fn) => fn;

// Mock the request module
const request = require('abacus-request');
let getspy;
const reqmock = extend({}, request, {
  get: (uri, opts, cb) => getspy(uri, opts, cb)
});
require.cache[require.resolve('abacus-request')].exports = reqmock;
getspy = (uri, opts, cb) => {
  // Expect a call to the provisioning service's validate
  if (uri === 'http://localhost:9880/v1/rating/plans/:rating_plan_id') {
    if (opts.rating_plan_id === 'notFound')
      return cb(undefined, {
        statusCode: 404,
        body: 'not found',
        headers: {
          'www-authenticate': 'test'
        }
      });
    if (opts.rating_plan_id === 'test-get-plan')
      return cb(undefined, {
        statusCode: 200,
        body: require('./test-rating-plan')
      });
    return cb('error', undefined);
  }

  if (uri === 'http://localhost:9881/v1/rating/organizations/:organization_id/resource_types/' +
    ':resource_type/plans/:plan_id/time/:time/rating_plan/id'
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

describe('abacus-rating-config', () => {
  it('returns rating plan given the rating plan id', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 4) done();
    };

    // Retrieve a rating plan
    config.plan('test-rating-plan', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.rating_plan.source).to.deep.equal(require('./test-rating-plan.js'));
      cb();
    });

    // Retrieve it again, this time it should be returned from the cache
    config.plan('test-rating-plan', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.rating_plan.source).to.deep.equal(require('./test-rating-plan.js'));
      cb();
    });

    // Config not found
    config.plan('notFound', undefined, (err, val) => {
      expect(err).to.deep.equal(undefined);
      expect(val).to.deep.equal({
        error: 'erplannotfound',
        reason: 'Rating plan with id notFound not found',
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
    config.plan('test-get-plan', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.rating_plan.plan_id).to.deep.equal('test-rating-plan');
      cb();
    });
  });

  it('returns a rating plan id', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 3) done();
    };

    // Retrieve a rating plan id
    config.id('test-org', 'test-resource', 'test-plan', 0, undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal({
        rating_plan_id: 'test-rating-plan'
      });
      cb();
    });

    // Retrieve it again, this time it should be returned from the cache
    config.id('test-org', 'test-resource', 'test-plan', 0, undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal({
        rating_plan_id: 'test-rating-plan'
      });
      cb();
    });

    // Make call to account
    config.id('test-org', 'test-id', 'test-id', 0, undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal({
        rating_plan_id: 'test-id'
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
          error: 'erpidnotfound',
          reason: 'Rating plan id for resource type ' + 'InvalidResourceType and plan id test-plan not found',
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
