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
  if (uri === 'http://localhost:9880/v1/metering/plans/:metering_plan_id') {
    if (opts.metering_plan_id === 'notFound')
      return cb(undefined, {
        statusCode: 404,
        body: 'not found',
        headers: {
          'www-authenticate': 'test'
        }
      });
    if (opts.metering_plan_id === 'test-plan')
      return cb(undefined, {
        statusCode: 200,
        body: require('./test-metering-plan')
      });
  }

  if (uri === 'http://localhost:9881/v1/metering/organizations/:organization_id/resource_types/' +
      ':resource_type/plans/:plan_id/time/:time/metering_plan/id'
  ) {
    expect(opts.resource_type).to.equal('test-id');
    cb(undefined, {
      statusCode: 200,
      body: 'test-id'
    });
  }

  return cb('unknown request');
};

const config = require('..');
const formula = require('../formula.js');

describe('abacus-metering-config', () => {
  it('returns metering plan id for an org, resource type, plan and time', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 3) done();
    };

    // Retrieve a metering plan id
    config.id(
      'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      'test-resource',
      'test-metering-plan',
      1420070400000,
      undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal({
          metering_plan_id: 'test-metering-plan'
        });
        cb();
      }
    );

    // Retrieve it again, this time it should be returned from the cache
    config.id(
      'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
      'test-resource',
      'test-metering-plan',
      1420070400000,
      undefined,
      (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal({
          metering_plan_id: 'test-metering-plan'
        });
        cb();
      }
    );

    // Make call to account
    config.id('a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', 'test-id', 'test-id', 1420070400000, undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal({
        metering_plan_id: 'test-id'
      });
      cb();
    });
  });

  it('returns metering plan for a metering plan id', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 4) done();
    };

    // Retrieve a metering plan
    config.plan('test-metering-plan', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.metering_plan.source).to.deep.equal(require('./test-metering-plan.js'));
      cb();
    });

    // Retrieve it again, this time it should be returned from the cache
    config.plan('test-metering-plan', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.metering_plan.source).to.deep.equal(require('./test-metering-plan.js'));
      cb();
    });

    // Retrieve resource that is not onboarded.
    config.plan('notFound', undefined, (err, val) => {
      expect(err).to.deep.equal(undefined);
      expect(val).to.deep.equal({
        error: 'emplannotfound',
        reason: 'Metering plan with id notFound not found',
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

    config.plan('test-plan', undefined, (err, val) => {
      expect(err).to.deep.equal(undefined);
      expect(val.metering_plan.plan_id).to.equal('test-metering-plan');
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
          error: 'empidnotfound',
          reason: 'Metering plan id for resource type ' + 'InvalidResourceType and plan id test-plan not found',
          cause: {
            statusCode: 404,
            body: 'Not found'
          }
        });
        done();
      }
    );
  });

  describe('evaluate metering formulas', () => {
    it('evaluates a formula with a unit', () => {
      expect(formula.meterfn('SUM({light_api_calls})').source).to.equal('m.light_api_calls');
    });
    it('evaluates a formula with a unit and a division', () => {
      expect(formula.meterfn('MAX({storage}/1073741824)').source).to.equal('m.storage / 1073741824');
    });
    it('evaluates a formula with a unit and a multiplication', () => {
      expect(formula.meterfn('MAX({storage}*1073741824)').source).to.equal('m.storage * 1073741824');
    });
    it('evaluates a formula with multiple units and a multiplication', () => {
      expect(formula.meterfn('SUM({memory}*{instances}*{time})').source).to.equal('m.memory * m.instances * m.time');
    });
  });
});
