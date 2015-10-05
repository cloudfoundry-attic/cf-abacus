'use strict';

// Provides access to resource metering and aggregation configuration.

const config = require('..');
const formula = require('../formula.js');

describe('abacus-resource-config', () => {
  it('returns resource config for a resource', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 2) done();
    };

    // Retrieve a resource config
    const t = 1420070400000;
    config('test-resource', t, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.source).to.deep.equal(require('./test-resource.js'));
      cb();
    })
    // Retrieve it again, this time it should be returned from the cache
    config('test-resource', t, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val.source).to.deep.equal(require('./test-resource.js'));
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

