'use strict';

// Duplicate detection using a LRU cache and bloom filters

const _ = require('underscore');
const lru = require('lru-cache');
const bloem = require('bloem');

const first = _.first;
const last = _.last;
const map = _.map;

// Setup debug log
const debug = require('abacus-debug')('abacus-dedupe');
const edebug = require('abacus-debug')('e-abacus-dedupe');

// Return a value dedupe filter
const deduper = (slack, max, cache) => {
  const fslack = slack ||
    parseInt(process.env.DEDUPE_SLACK) || 1000 * 3600 * 48;
  const fmax = max ||
    parseInt(process.env.DEDUPE_MAX) || 10000000;
  const fcache = cache || 10000;

  // Cache the values in a LRU cache
  const lrucache = lru({
    max: fcache,
    length: (n) => 1,
    dispose: (val, n) => undefined,
    maxAge: 1000 * 3600
  });

  // Create a bloom filter
  const filter = (t) => {
    const f = new bloem.SafeBloem(fmax, 0.01);
    f.time = t;
    f.count = 0;
    return f;
  };

  // Maintain a rolling list of 2 filters
  // Warning: filters is a mutable variable but it's really the simplest
  // way to implement this
  const t = Date.now();
  let filters = [filter(t), filter(t)];

  return {
    // Add the value to the dedupe filter
    add: (val) => {
      debug('Adding value %s to dedupe filter', val);

      // Add value to the LRU cache
      lrucache.set(val, val);

      // Roll expired filter out if needed
      const t = Date.now();
      if(last(filters).time < t - fslack)
        // Warning: mutating variable filters
        filters = [filter(t)].concat([first(filters)]);

      // Add value to the bloom filter
      map(filters, (f) => {
        f.add(val);
        f.count = f.count + 1;
      });
      if(filters[1].count >= fmax)
        edebug('Dedupe filter capacity exceeded %d', filters[1].count);
    },

    // Return true if the filter has the given value
    has: (val) => {
      if(lrucache.has(val)) {
        debug('Value %s found in dedupe cache, is a duplicate', val);
        return true;
      }
      if(filters[1].has(val)) {
        debug('Value %s found in dedupe filter, may be a duplicate', val);
        return undefined;
      }
      debug('Value %s not found in dedupe filter, not a duplicate', val);
      return false;
    }
  };
};

// Export our public functions
module.exports = deduper;

