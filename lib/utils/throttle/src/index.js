'use strict';

// Small utility that throttles calls to a Node function with callback to a
// maximum number of concurrent calls.

const _ = require('underscore');
const yieldable = require('abacus-yieldable');

const initial = _.initial;
const last = _.last;
const extend = _.extend;
const isFunction = _.isFunction;
const map = _.map;
const object = _.object;
const pairs = _.pairs;
const functions = _.functions;
const bind = _.bind;
const defaults = _.defaults;

// Setup debug log
const debug = require('abacus-debug')('abacus-throttle');

// Throttle the execution of an application function with callback to a
// maximum number of calls, defaults to 1000
const throttlefn = function(fn, max) {
  const fcb = yieldable.functioncb(fn);

  // Preserve original function name
  const name = fcb.fname || fcb.name;

  const opt = defaults({
    max: max
  }, {
    max: parseInt(process.env.THROTTLE) || 1000
  });

  let running = 0;
  let queue = [];

  const run = (args) => {
    // Call the application function
    const cb = last(args);
    try {
      fcb.apply(null, initial(args).concat([function(err, val) {
        // Call the application callback
        try {
          cb(err, val);
        }
        finally {
          // Schedule the execution of the next queued call
          next();
        }
      }]));
    }
    catch(e) {
      // Schedule the execution of the next queued call
      next();
    }
  };

  // Schedule the execution of the next queued call
  const next = () => {
    if(queue.length) {
      debug('Scheduling execution of queued function call to %s, ' + 
        'queue size %d', name, queue.length - 1);
      const args = queue.shift();
      setImmediate(() => run(args));
    }
    else running = running - 1;
  };

  return extend(function() {
    // Queue calls to the application function if we have reached the
    // max allowed concurrent calls
    if(running === opt.max) {
      debug(
        'Queuing function call to %s, reached max concurrent calls %d, ' +
        'queue size %d', name, opt.max, queue.length + 1);
      return queue.push(arguments);
    }

    // Run the application function right away
    running = running + 1;
    return run(arguments);
  }, {
    // Preserve the original function name
    fname: name
  });
};


// Bind a function to an object while preserving the original function name
const nbind = (o, k) => extend(bind(o[k], o), {
  fname: o[k].fname || (o.fname || o.name) + '.' + k
});

// Convert an application function to a throttled function, if the given
// function is a module then convert all the module's exported functions as
// well.
const throttle = (fn, max) => extend(isFunction(fn) ? throttlefn(fn, max) : {},
  object(pairs(fn)), object(map(functions(fn),
    (k) => [k, throttlefn(nbind(fn, k), max)])));

// Export our public functions
module.exports = throttle;

