'use strict';

// Duplicate detection using a LRU cache and bloom filters

const _ = require('underscore');
const bloem = require('bloem');
const lru = require('abacus-lrucache');
const zlib = require('zlib');
const moment = require('abacus-moment');

const first = _.first;
const last = _.last;
const map = _.map;
const defaults = _.defaults;
const extend = _.extend;

// Setup debug log
const debug = require('abacus-debug')('abacus-dedupe');
const edebug = require('abacus-debug')('e-abacus-dedupe');

// The scaling factor of each time window for creating the date string
// [Second, Minute, Hour, Day, Month]
const slacks = () => /^[0-9]+[MDhms]$/.test(process.env.SLACK) ? {
  scale : process.env.SLACK.charAt(process.env.SLACK.length - 1),
  width : process.env.SLACK.match(/[0-9]+/)[0]
} : {
  scale : 'm',
  width : 10
};

// Millisecond representation of the time dimensions
const msDimensions = {
  M: 2678400000,
  D: 86400000,
  h: 3600000,
  m: 60000,
  s: 1000
};

// Return a value dedupe filter
const deduper = (slack, max, cache) => {
  const opt = defaults({
    slack: slack,
    max: max,
    cache: cache
  }, {
    slack: msDimensions[slacks().scale] * slacks().width,
    max: parseInt(process.env.DEDUPE_MAX) || 10000000,
    cache: parseInt(process.env.DEDUPE_CACHE) || 1000
  });

  // Cache the values in a LRU cache
  const lrucache = lru({
    max: opt.cache,
    maxAge: 1000 * 3600
  });

  // Create a bloom filter
  const filter = (t) => {
    const f = new bloem.SafeBloem(opt.max, 0.01);
    f.time = t;
    return f;
  };

  // Maintain a rolling list of 2 filters
  // Warning: filters is a mutable variable but it's really the simplest
  // way to implement this
  const t = moment.now();
  let filters = [filter(t + opt.slack), filter(t)];

  return {
    // Add the value to the dedupe filter
    add: (val) => {
      debug('Adding value %s to dedupe filter', val);

      // Add value to the LRU cache
      lrucache.set(val, val);

      // Roll expired filter out if needed
      const t = moment.now();
      if(last(filters).time < t - opt.slack)
        // Warning: mutating variable filters
        filters = [filter(t + opt.slack)].concat([first(filters)]);

      // Add value to the bloom filter
      map(filters, (f) => {
        f.add(val);
      });
      if(filters[1].count >= opt.max)
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
    },

    // Serialize the bloom filter to be stored to the db.
    serialize: () => {
      return {
        filters: map(filters, (filter) => {
          return extend({}, filter, {
            filter: {
              bitfield: {
                buffer: zlib.deflateSync(filter.filter.bitfield.buffer)
                  .toString('base64')
              }
            }
          });
        }),
        times: map(filters, (filter) => filter.time),
        counts: map(filters, (filter) => filter.count)
      };
    },

    // Deserialize the bloom filter and use it.
    deserialize: (sFilters) => {
      filters = map(sFilters.filters, (filter, i) => {
        const df = extend({ }, filter, {
          filter: {
            bitfield: {
              buffer: zlib.inflateSync(
                new Buffer(filter.filter.bitfield.buffer,
                  'base64'))
            }
          }
        });
        const f = new bloem.SafeBloem.destringify(df);
        f.time = sFilters.times[i];
        f.count = sFilters.counts[i];
        return f;
      });
    }
  };
};

// Export our public functions
module.exports = deduper;
