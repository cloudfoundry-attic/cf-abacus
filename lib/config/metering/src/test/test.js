'use strict';

// Provides access to metering plans.

const config = require('..');
const formula = require('../formula.js');

describe('abacus-metering-config', () => {
  it('returns metering plan id for an org, resource type, plan and time',
    (done) => {
      let cbs = 0;
      const cb = () => {
        if (++cbs === 2) done();
      };

      // Retrieve a metering plan id
      config.id(
        'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', 'test-resource',
        'basic-test-metering-plan', 1420070400000, undefined, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val).to.equal('basic-test-metering-plan');
          cb();
        })

      // Retrieve it again, this time it should be returned from the cache
      config.id(
        'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27', 'test-resource',
        'basic-test-metering-plan', 1420070400000, undefined, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val).to.equal('basic-test-metering-plan');
          cb();
        })
    });

  it('returns metering plan for a metering plan id', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 2) done();
    };

    // Retrieve a metering plan
    config.plan('basic-test-metering-plan', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.source).to.deep.equal(
        require('./basic-test-metering-plan.js'));
      cb();
    })

    // Retrieve it again, this time it should be returned from the cache
    config.plan('basic-test-metering-plan', undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.source).to.deep.equal(
        require('./basic-test-metering-plan.js'));
      cb();
    })
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

