'use strict';

// Duplicate detection using a LRU cache and bloom filters

const { defaults } = require('underscore');

const lru = require('abacus-lrucache');

const debug = require('abacus-debug')('abacus-dedupe');

// Return a value dedupe filter
const deduper = (maxCacheSize) => {
  const opt = defaults(
    {
      cache: maxCacheSize
    },
    {
      cache: parseInt(process.env.DEDUPE_CACHE) || 1000
    }
  );

  // Cache the values in a LRU cache
  const lrucache = lru({
    max: opt.cache,
    maxAge: 1000 * 3600
  });

  return {
    add: (val) => {
      debug('Adding value %s to dedupe filter', val);
      lrucache.set(val, val);
    },

    has: (val) => {
      const found = lrucache.has(val);
      debug(`Value %s ${found ? '' : 'not'} found in dedupe cache`, val);
      return found;
    }
  };
};

// Export our public functions
module.exports = deduper;
