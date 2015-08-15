'use strict';

// Provides access to resource pricing configuration.

const config = require('..');

describe('abacus-resource-config', () => {
  it('returns price config for a resource', () => {
    expect(config('storage')).to.deep.equal(require('../resources/storage.js'));
  });
});

