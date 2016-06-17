'use strict';

// Provides access to metering plans.
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
    'http://localhost:9880/v1/metering/plans/:metering_plan_id') {
    expect(reqs[0][1].metering_plan_id).to.equal('notFound');
    expect(reqs[1][1].metering_plan_id).to.equal('test-plan');
    cb(undefined, [[undefined, {
      statusCode: 404,
      body: 'not found',
      headers: {
        'www-authenticate': 'test'
      }
    }], [undefined, {
      statusCode: 200,
      body: require('./test-metering-plan')
    }]]);
  }

  if(reqs[0][0] === 'http://localhost:9881' +
    '/v1/metering/organizations/:organization_id/resource_types/' +
    ':resource_type/plans/:plan_id/time/:time/metering_plan/id') {
    expect(reqs[0][1].resource_type).to.equal('test-id');
    cb(undefined, [[undefined, {
      statusCode: 200,
      body: 'test-id'
    }]]);
  }
};

const config = require('..');
const formula = require('../formula.js');

describe('abacus-metering-config', () => {
  it('returns metering plan id for an org, resource type, plan and time',
    (done) => {
      let cbs = 0;
      const cb = () => {
        if (++cbs === 3) done();
      };

      // Retrieve a metering plan id
      config.id(
        'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', 'test-resource',
        'test-metering-plan', 1420070400000, undefined, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val).to.deep.equal({
            metering_plan_id: 'test-metering-plan'
          });
          cb();
        });

      // Retrieve it again, this time it should be returned from the cache
      config.id(
        'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', 'test-resource',
        'test-metering-plan', 1420070400000, undefined, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val).to.deep.equal({
            metering_plan_id: 'test-metering-plan'
          });
          cb();
        });

      // Make call to account
      config.id(
        'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', 'test-id',
        'test-id', 1420070400000, undefined, (err, val) => {
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
      expect(val.metering_plan.source).to.deep.equal(
        require('./test-metering-plan.js'));
      cb();
    });

    // Retrieve it again, this time it should be returned from the cache
    config.plan('test-metering-plan', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.metering_plan.source).to.deep.equal(
        require('./test-metering-plan.js'));
      cb();
    });

    // Retrieve resource that is not onboarded.
    config.plan('notFound', undefined, (err, val) => {
      expect(err).to.deep.equal(undefined);
      expect(val).to.deep.equal({
        error: 'emplannotfound',
        reason: 'Metering plan for the metering plan id notFound is not found'
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
    getspy = (reqs, cb) =>
      cb(null, [[undefined, { statusCode: 404, body: 'Not found' }]]);
 
    // When the plan id does not map to a plan
    config.id(
      'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', 'InvalidResourceType',
      'test-plan', 1420070400000, undefined, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal({
          error: 'empidnotfound',
          reason: 'Unable to find metering plan id for resource type ' +
            'InvalidResourceType and plan id test-plan'
        });
        done();
      });
  });

  describe('evaluate metering formulas', () => {
    it('evaluates a formula with a unit', () => {
      expect(formula.meterfn('SUM({light_api_calls})').source)
        .to.equal('m.light_api_calls');
    });
    it('evaluates a formula with a unit and a division', () => {
      expect(formula.meterfn('MAX({storage}/1073741824)').source)
        .to.equal('m.storage / 1073741824');
    });
    it('evaluates a formula with a unit and a multiplication', () => {
      expect(formula.meterfn('MAX({storage}*1073741824)').source)
        .to.equal('m.storage * 1073741824');
    });
    it('evaluates a formula with multiple units and a multiplication', () => {
      expect(formula.meterfn('SUM({memory}*{instances}*{time})').source)
        .to.equal('m.memory * m.instances * m.time');
    });
  });
});

