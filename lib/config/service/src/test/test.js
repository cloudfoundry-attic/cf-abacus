'use strict';

// Provides access to service metering and aggregation configuration.

const _ = require('underscore');
const map = _.map;
const pairs = _.pairs;

const schemas = require('abacus-metering-schemas');

const config = require('..');

describe('abacus-service-config', () => {
    it('returns service config for a service', () => {
        expect(config('storage')).to.deep.equal(require('../services/storage.js'));
        expect(config('analytics')).to.deep.equal(require('../services/analytics.js'));
    });

    it('validates all service configurations', () => {
        map(pairs(config.all()), (s) => {
            console.log('    validating', s[0], 'service');
            expect(schemas.serviceDefinition.validate(s[1])).to.deep.equal(s[1]);
            console.log('        validated', s[0], 'service');
        });
    });
});

