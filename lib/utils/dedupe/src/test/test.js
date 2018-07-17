'use strict';

// Duplicate detection using a LRU cache

const dedupe = require('..');

/* eslint handle-callback-err: 0 */

describe('abacus-dedupe', () => {

  context('with enabled cache', () => {
    before(() => {
      process.env.CACHE = true;
    });

    context('without max cache size', () => {
      const f = dedupe();

      before(() => {
        f.add('a');
        f.add('b');
        f.add('c');
        f.add('d');
      });

      it('adds all of our keys to cache', () => {
        expect(f.has('a')).to.equal(true);
        expect(f.has('b')).to.equal(true);
        expect(f.has('c')).to.equal(true);
        expect(f.has('d')).to.equal(true);
      });

      it('unknown keys are not found', () => {
        expect(f.has('x')).to.equal(false);
      });
    });

    context('with max cache size', () => {
      const f = dedupe(2);

      before(() => {
        f.add('a');
        f.add('b');
        f.add('c');
        f.add('d');
        f.add('e');
      });

      it('older keys are removed from cache', () => {
        expect(f.has('a')).to.equal(false);
        expect(f.has('b')).to.equal(false);
        expect(f.has('c')).to.equal(false);
      });

      it('adds only last keys to cache', () => {
        expect(f.has('d')).to.equal(true);
        expect(f.has('e')).to.equal(true);
      });

      it('unknown keys are not found', () => {
        expect(f.has('x')).to.equal(false);
      });
    });
  });

  context('with disabled cache', () => {
    let f;

    before(() => {
      process.env.CACHE = false;

      f = dedupe(undefined, 2);
      f.add('a');
      f.add('b');
      f.add('c');
      f.add('d');
    });

    it('does not cache', () => {
      expect(f.has('a')).to.equal(false);
      expect(f.has('b')).to.equal(false);
      expect(f.has('c')).to.equal(false);
      expect(f.has('d')).to.equal(false);
    });

    it('unknown keys are not found either', () => {
      expect(f.has('x')).to.equal(false);
    });
  });
});
