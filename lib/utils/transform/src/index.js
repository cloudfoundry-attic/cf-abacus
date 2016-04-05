'use strict';

// Simple async map, reduce, and filter data transformation functions with
// callbacks. These functions are very similar to the underscore.js map,
// reduce, and filter functions but they can take Node functions with
// callbacks, generators and promises.

const _ = require('underscore');
const yieldable = require('abacus-yieldable');

const map = _.map;
const filter = _.filter;

// Setup debug log
const debug = require('abacus-debug')('abacus-transform');

// Apply an asynchronous reduce function to a list and call back when the
// whole list has been reduced
const cbreduce = (l, fn, a, cb) => {
  debug('Reduce list %o, initial accum %o', l, a);

  // Convert to a regular function with callback if needed
  const f = yieldable.functioncb(fn);

  // Apply the reduction function one value at a time, recursively
  const reduce1 = (a, i, l, cb) => {
    debug('Applying reduction to value %o, accum %o', l[i], a);
    f(a, l[i], i, l, (err, a) => {
      if(err) {
        // Return any error
        debug('Reduction error %o', err);
        cb(err);
      }
      else if(i === l.length - 1) {
        // Return the final result once we've applied the reduction
        // function to all values in the list
        debug('Final reduction accum %o', a);
        cb(undefined, a);
      }
      // Apply the reduction function to the next value in the list
      else reduce1(a, i + 1, l, cb);
    });
  };

  // If the given list is empty, return the given accumulator right away
  if(l.length === 0) {
    debug('Final reduction accum %o', a);
    setImmediate(() => {
      cb(undefined, a);
    });
    return;
  }

  // Apply the reduction function to the given list
  reduce1(a, 0, l, cb);
};

// Apply an asynchronous map function to a list and call back when the whole
// list has been mapped
const cbmap = (l, fn, cb) => {
  debug('Map list %o', l);

  // Convert to a regular function with callback if needed
  const f = yieldable.functioncb(fn);

  // If the given list is empty, return it right away
  if(l.length === 0) {
    debug('Final map result %o', l);
    setImmediate(() => {
      cb(undefined, l);
    });
    return;
  }

  // Warning: err is a mutable variable, but that's really the only way to
  // record reduction errors asynchronously
  let err;
  // Warning: accum is a mutable variable, but that's really the only way to
  // accumulate the map results asynchronously
  let accum = new Array(l.length);
  // Warning: n is a mutable variable, but that's really the only way to
  // count the asynchronous map executions
  let n = 0;
  map(l, (v, i, l) => {
    debug('Applying map to value %o', v);
    f(v, i, l, (e, r) => {
      // Warning: mutating variable err
      err = !err && e ? e : err;
      // Warning: mutating variable accum
      accum[i] = r;
      // Warning: mutating variable n
      n = n + 1;
      debug('Map result %o', r);
      if(n === l.length) {
        if(err) {
          debug('Map error %o', err);
          cb(err);
          return;
        }
        debug('Final map result %o', accum);
        cb(undefined, accum);
      }
    });
  });
};

// Apply an asynchronous filter function to a list and call back when the whole
// list has been filtered
const cbfilter = (l, fn, cb) => {
  debug('Filter list %o', l);

  // Convert to a regular function with callback if needed
  const f = yieldable.functioncb(fn);

  cbmap(l, f, (err, accum) => {
    if(err) {
      debug('Filter error %o', err);
      cb(err);
    }
    else {
      const res = filter(l, (v, i, l) => accum[i]);
      debug('Final filter result %o', res);
      cb(undefined, res);
    }
  });
};

// Export our public functions
module.exports = cbreduce;
module.exports.reduce = cbreduce;
module.exports.map = cbmap;
module.exports.filter = cbfilter;

