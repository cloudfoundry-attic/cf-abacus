'use strict';

// A wrapper around the lru-cache module
const lru = require('..');
const memoize = require('..').memoize;



describe('abacus-lrucache', () => {
  it('caches objects', () => {
    lru();
  });

  it('memoizes given function with default hash', () => {
    let callCount = 0;
    const memoizedFib = memoize((n) => {
      callCount++;
      return n <= 2 ? 1 : memoizedFib(n - 1) + memoizedFib(n - 2);
    });

    const sixth = memoizedFib(6);

    expect(sixth).to.equal(8);
    expect(callCount).to.equal(6);
  });

  it('throws when try to memoize undefined', () => {
    const memoizeUndefined = memoize(undefined);

    expect(memoizeUndefined).to.throw();
  });
});

