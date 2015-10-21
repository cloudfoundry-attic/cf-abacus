'use strict';

// Duplicate detection using a LRU cache and bloom filters

const dedupe = require('..');

/* eslint handle-callback-err: 0 */

describe('abacus-dedupe', () => {
  it('detects duplicate values', () => {

    // Create a dedupe filter
    const f = dedupe(undefined, undefined, 2);

    // Add some values
    f.add('a');
    f.add('b');
    f.add('c');
    f.add('d');

    // Check if they're in the filter
    expect(f.has('a')).to.equal(undefined);
    expect(f.has('b')).to.equal(undefined);
    expect(f.has('c')).to.equal(true);
    expect(f.has('d')).to.equal(true);
    expect(f.has('x')).to.equal(false);
  });
});

