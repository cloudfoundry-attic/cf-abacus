'use strict';

// A wrapper around the lru-cache module

const { defaults } = require('underscore');
const lru = require('lru-cache');

// Setup debug log
const debug = require('abacus-debug')('abacus-lrucache');

// Return a LRU cache
const lrucache = (opt) => {
  if (process.env.CACHE === 'false')
    return {
      set: (k, v) => undefined,
      has: (k) => false,
      get: (k) => undefined,
      del: (k) => undefined
    };

  debug('Creating cache %o', opt);
  const cache = new lru(
    defaults(opt, {
      length: (v) => 1
    })
  );

  return {
    set: (k, v) => cache.set(k, v),
    has: (k) => cache.has(k),
    get: (k) => cache.get(k),
    del: (k) => cache.del(k)
  };
};

const memoize = (func, hashFunction = (n) => n, opt) => {
  const memoizedFunction = function() {
    let cache = memoizedFunction.cache;
    const key = '' + hashFunction.apply(this, arguments);

    if (!cache.has(key)) {
      const result = func.apply(this, arguments);
      cache.set(key, result);
      return result;
    }

    return cache.get(key);
  };

  memoizedFunction.cache = lrucache(opt);
  return memoizedFunction;
};

// Export our public functions
module.exports = lrucache;
module.exports.memoize = memoize;
