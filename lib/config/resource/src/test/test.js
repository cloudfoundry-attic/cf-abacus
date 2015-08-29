'use strict';

// Provides access to resource metering and aggregation configuration.

const _ = require('underscore');
const map = _.map;
const pairs = _.pairs;

const schemas = require('abacus-usage-schemas');

const config = require('..');
const formula = require('../formula.js');

describe('abacus-resource-config', () => {
  it('returns resource config for a resource', () => {
    expect(config('storage').source)
      .to.deep.equal(require('../resources/storage.js'));
    expect(config('analytics').source)
      .to.deep.equal(require('../resources/analytics.js'));
  });

  it('validates all resource configurations', () => {
    map(pairs(config.all()), (s) => {
      console.log('    validating', s[0], 'resource');
      expect(schemas.resourceDefinition.validate(s[1].source))
        .to.deep.equal(s[1].source);
      console.log('        validated', s[0], 'resource');
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

