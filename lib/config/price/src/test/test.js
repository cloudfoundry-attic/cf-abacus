'use strict';

// Provides access to resource pricing configuration.

const config = require('..');

describe('abacus-price-config', () => {
  it('returns price config for a resource', (done) => {
    let cbs = 0;
    const cb = () => {
      if (++cbs === 2) done();
    };

    // Retrieve a resource config
    const t = 1420070400000;
    config('test-resource', t, undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal(require('./test-resource.js'));
      cb();
    })
    // Retrieve it again, this time it should be returned from the cache
    config('test-resource', t, undefined, (err, val) => {
      expect(err).to.equal(undefined);
      expect(val).to.deep.equal(require('./test-resource.js'));
      cb();
    })
  });
});
