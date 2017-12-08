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

  it('serializes and deserializes the filters', () => {
    // Create a dedupe filter
    const f = dedupe(undefined, undefined);

    // Add some values
    f.add('a');
    f.add('b');
    f.add('c');
    f.add('d');

    // Serialize the filters
    const serialized = f.serialize();
    expect(serialized).to.have.all.keys('filters', 'times', 'counts');

    // Create a new dedupe filter
    const newf = dedupe(undefined, undefined);
    // They should not be in the filter
    expect(newf.has('a')).to.equal(false);
    expect(newf.has('b')).to.equal(false);
    expect(newf.has('c')).to.equal(false);
    expect(newf.has('d')).to.equal(false);

    // Deserialize filters
    newf.deserialize(serialized);
    // They should be in the filter now
    expect(newf.has('a')).to.equal(undefined);
    expect(newf.has('b')).to.equal(undefined);
    expect(newf.has('c')).to.equal(undefined);
    expect(newf.has('d')).to.equal(undefined);
  });
});
