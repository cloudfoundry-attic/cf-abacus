'use strict';

// A wrapper around the lru-cache module
const lru = require('..');
const memoize = require('..').memoize;

describe('abacus-lrucache', () => {
  it('caches objects', () => {
    lru();
  });

  describe('memoize', () => {
    let callCount;
    let sixth;

    after(() => {
      delete process.env.CACHE;
    });

    beforeEach(() => {
      callCount = 0;
      const memoizedFib = memoize((n) => {
        callCount++;
        return n <= 2 ? 1 : memoizedFib(n - 1) + memoizedFib(n - 2);
      });

      sixth = memoizedFib(6);
    });

    context('with enabled cache', () => {
      before(() => {
        process.env.CACHE = true;
      });

      it('memoizes given function with default hash', () => {
        expect(sixth).to.equal(8);
        expect(callCount).to.equal(6);
      });
    });

    context('with disabled cache', () => {
      before(() => {
        process.env.CACHE = false;
      });

      it('executes the function', () => {
        expect(sixth).to.equal(8);
        expect(callCount).to.equal(15);
      });
    });
  });

  it('throws when try to memoize undefined', () => {
    const memoizeUndefined = memoize(undefined);

    expect(memoizeUndefined).to.throw();
  });
});
