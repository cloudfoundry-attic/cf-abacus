'use strict';

// Duplicate detection using a LRU cache and bloom filters

const dedupe = require('..');

/* eslint handle-callback-err: 0 */

describe('abacus-dedupe', () => {

  context('with enabled cache', () => {
    before(() => {
      process.env.CACHE = true;
    });

    it('detects duplicate values', () => {
      const f = dedupe(undefined, undefined, 2);

      f.add('a');
      f.add('b');
      f.add('c');
      f.add('d');

      // in the filter
      expect(f.has('a')).to.equal(undefined);
      expect(f.has('b')).to.equal(undefined);

      // in cache
      expect(f.has('c')).to.equal(true);
      expect(f.has('d')).to.equal(true);

      // not in cache
      expect(f.has('x')).to.equal(false);
    });

    it('serializes and deserializes the filters', () => {
      const f = dedupe(undefined, undefined);

      f.add('a');
      f.add('b');
      f.add('c');
      f.add('d');

      const serialized = f.serialize();
      expect(serialized).to.have.all.keys('filters', 'times', 'counts');

      const newf = dedupe(undefined, undefined);
      expect(newf.has('a')).to.equal(false);
      expect(newf.has('b')).to.equal(false);
      expect(newf.has('c')).to.equal(false);
      expect(newf.has('d')).to.equal(false);

      newf.deserialize(serialized);
      expect(newf.has('a')).to.equal(undefined);
      expect(newf.has('b')).to.equal(undefined);
      expect(newf.has('c')).to.equal(undefined);
      expect(newf.has('d')).to.equal(undefined);
    });
  });

  context('with disabled cache', () => {
    before(() => {
      process.env.CACHE = false;
    });

    it('uses only filter', () => {
      const f = dedupe(undefined, undefined, 2);

      // Add some values
      f.add('a');
      f.add('b');
      f.add('c');
      f.add('d');

      // in the filter
      expect(f.has('a')).to.equal(undefined);
      expect(f.has('b')).to.equal(undefined);

      // in filter (no cache)
      expect(f.has('c')).to.equal(undefined);
      expect(f.has('d')).to.equal(undefined);

      // not in filter and no cache
      expect(f.has('x')).to.equal(false);
    });
  });
});
