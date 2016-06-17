'use strict';

// Provides access to rating plans
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
    'http://localhost:9880/v1/rating/plans/:rating_plan_id') {
    expect(reqs[0][1].rating_plan_id).to.equal('notFound');
    expect(reqs[1][1].rating_plan_id).to.equal('test-get-plan');
    cb(undefined, [[undefined, {
      statusCode: 404,
      body: 'not found',
      headers: {
        'www-authenticate': 'test'
      }
    }], [undefined, {
      statusCode: 200,
      body: require('./test-rating-plan')
    }], ['error', undefined]]);
  }

  if(reqs[0][0] === 'http://localhost:9881' +
    '/v1/rating/organizations/:organization_id/resource_types/' +
    ':resource_type/plans/:plan_id/time/:time/rating_plan/id') {
    expect(reqs[0][1].resource_type).to.equal('test-id');
    cb(undefined, [[undefined, {
      statusCode: 200,
      body: 'test-id'
    }]]);
  }
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
      expect(val.rating_plan.source).to.deep.equal(
        require('./test-rating-plan.js'));
      cb();
    });

    // Retrieve it again, this time it should be returned from the cache
    config.plan('test-rating-plan', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.rating_plan.source).to.deep.equal(
        require('./test-rating-plan.js'));
      cb();
    });

    // Config not found
    config.plan('notFound', undefined, (err, val) => {
      expect(err).to.deep.equal(undefined);
      expect(val).to.deep.equal({
        error: 'erplannotfound',
        reason: 'Rating plan for the rating plan id notFound is not found'
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
    config.id('test-org', 'test-resource', 'test-plan', 0, undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal({
          rating_plan_id: 'test-rating-plan'
        });
        cb();
      });

    // Retrieve it again, this time it should be returned from the cache
    config.id('test-org', 'test-resource', 'test-plan', 0, undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal({
          rating_plan_id: 'test-rating-plan'
        });
        cb();
      });

    // Make call to account
    config.id('test-org', 'test-id', 'test-id', 0, undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal({
          rating_plan_id: 'test-id'
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
          error: 'erpidnotfound',
          reason: 'Unable to find rating plan id for resource type ' +
            'InvalidResourceType and plan id test-plan'
        });
        done();
      });
  });
});
