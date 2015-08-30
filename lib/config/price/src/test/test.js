'use strict';

// Provides access to resource pricing configuration.

const config = require('..');

describe('abacus-price-config', () => {
  it('returns price config for a resource', () => {
    expect(config('object-storage')).to.deep.equal(
      require('../resources/storage.js'));
  });
});

