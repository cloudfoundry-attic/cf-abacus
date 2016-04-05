'use strict';

// Tiny wrapper around the Node retry module providing call retries with
// exponential backoff, with a more natural interface than the original
// retry module.

const _ = require('underscore');
const yieldable = require('abacus-yieldable');
const _retry = require('retry');

const initial = _.initial;
const last = _.last;
const extend = _.extend;
const isFunction = _.isFunction;
const map = _.map;
const object = _.object;
const pairs = _.pairs;
const functions = _.functions;
const bind = _.bind;

// Setup debug log
const debug = require('abacus-debug')('abacus-retry');
const edebug = require('abacus-debug')('e-abacus-retry');

// Return retry configuration options with some reasonable defaults
const options = (retries, min, max, factor, random) => {
  const def = function(v, d) {
    return v === undefined ? d : v;
  };
  return {
    retries: def(retries, 5),
    minTimeout: def(min, 50),
    maxTimeout: def(max, 500),
    factor: def(factor, 2),
    randomize: def(random, true)
  };
};

// Convert an application function to a retry wrapper function that attempts
// to call it then automatically retries after a failure using an exponential
// backoff. The retries, min, max, factor and random parameters are optional.
const retryfn = (fn, retries, min, max, factor, random) => {
  // Convert to a function with callback
  const fcb = yieldable.functioncb(fn);

  // Preserve original function name
  const name = fcb.fname || fcb.name;

  // Process configuration options
  const opt = options(retries, min, max, factor, random);

  // Create a wrapper around the application function
  const wrapper = extend(function() {

    // Assume the usal function signature with a callback
    const args = initial(arguments);
    const cb = last(arguments);

    // Create a retry operation
    const op = _retry.operation(opt);

    // Attempt the operation
    debug('Calling function %s', name);
    op.attempt((attempt) => {

      // Call the application function with our own callback to intercept
      // the call results
      fcb.apply(undefined, args.concat([(err, val) => {

        // Retry on error until the configured number of retries has
        // been reached, unless the returned error requests to skip
        // retrying
        if(!(err && err.noretry) && op.retry(err)) {
          debug('Retrying failed call to function %s', name);
          return;
        }

        // Call back with the first error or the success result
        if(err) {
          edebug('Function %s calling back with error %o', name, err);
          debug('Function %s calling back with error %o', name, err);
        }
        else
          debug('Function %s calling back with success', name);

        const e = err ? err.noretry ? err : op.errors()[0] : undefined;
        debug('Function %s calling back with %o, %o', name, e, val);
        cb(e, val);
      }]));
    });
  }, {
    // Preserve the original function name
    fname: fcb.fname || fcb.name
  });

  return wrapper;
};

// Bind a function to an object while preserving the original function name
const nbind = (o, k) => extend(bind(o[k], o), {
  fname: o[k].fname || (o.fname || o.name) + '.' + k
});

// Convert an application function to a retry function, if the given function
// is a module then convert all the module's exported functions as well.
const retry = (fn, retries, min, max, factor, random) => extend(
  isFunction(fn) ? retryfn(fn, retries, min, max, factor, random) : {},
  object(pairs(fn)), object(map(functions(fn),
    (k) => [k, retryfn(nbind(fn, k), retries, min, max, factor, random)])));

// Export our public functions
module.exports = retry;

