'use strict';

// Provides access to resource metering and aggregation configuration.

const _ = require('underscore');
const map = _.map;
const pairs = _.pairs;

const schemas = require('abacus-usage-schemas');

const config = require('..');

describe('abacus-resource-config', () => {
  it('returns resource config for a resource', () => {
    expect(
      config('storage')).to.deep.equal(require('../resources/storage.js'));
    expect(
      config('analytics')).to.deep.equal(require('../resources/analytics.js'));
  });

  it('validates all resource configurations', () => {
    map(pairs(config.all()), (s) => {
      console.log('    validating', s[0], 'resource');
      expect(schemas.resourceDefinition.validate(s[1])).to.deep.equal(s[1]);
      console.log('        validated', s[0], 'resource');
    });
  });
});

