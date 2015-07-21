'use strict';

// Provides access to service pricing configuration.

const config = require('..');

describe('cf-abacus-service-config', () => {
    it('returns service config for a service', () => {
        expect(config('storage')).to.deep.equal(require('../services/storage.js'));
    });
});

