'use strict';

// A wrapper around the lru-cache module

const _ = require('underscore');
const lru = require('lru-cache');

const defaults = _.defaults;

// Setup debug log
const debug = require('abacus-debug')('abacus-lrucache');

// Return a LRU cache
const lrucache = (opt) => {
  if(process.env.CACHE === 'false')
    return {
      set: (k, v) => undefined,
      has: (k) => false,
      get: (k) => undefined,
      del: (k) => undefined
    };

  debug('Creating cache %o', opt);
  const cache = lru(defaults(opt, {
    length: (v) => 1
  }));

  return {
    set: (k, v) => cache.set(k, v),
    has: (k) => cache.has(k),
    get: (k) => cache.get(k),
    del: (k) => cache.del(k)
  };
};

// Export our public functions
module.exports = lrucache;

