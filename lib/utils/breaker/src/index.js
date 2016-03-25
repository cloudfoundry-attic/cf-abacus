'use strict';

// Simple auto-reclosing circuit breaker for Node-style calls, inspired by the
// Akka breaker. The circuit breaker helps protect functions that sometimes
// fail and avoid failure cascades in a graph of function calls. The breaker
// API was inspired by the Akka breaker with a few refinements to make it
// simpler and more in line with the usual Node function call patterns.

const _ = require('underscore');
const perf = require('abacus-perf');
const yieldable = require('abacus-yieldable');
const util = require('util');

const last = _.last;
const initial = _.initial;
const extend = _.extend;
const isFunction = _.isFunction;
const map = _.map;
const object = _.object;
const pairs = _.pairs;
const functions = _.functions;
const bind = _.bind;
const defaults = _.defaults;

// Setup debug log
const debug = require('abacus-debug')('abacus-breaker');
const edebug = require('abacus-debug')('e-abacus-breaker');

// Circuit breaker options, with the following defaults:
// timeout a call after 60 secs,
// 10 calls must occur before stats matter,
// trip circuit when 50% calls are failures or latent,
// sleep 5 secs before trying again a tripped circuit
const options = (callTimeout, callThreshold, errorPercentage, resetTimeout) => {
  return defaults({
    timeout: callTimeout,
    threshold: callThreshold,
    errors: errorPercentage,
    reset: resetTimeout
  }, {
    timeout: parseInt(process.env.BREAKER_TIMEOUT) || 60000,
    threshold: parseInt(process.env.BREAKER_THRESHOLD) || 10,
    errors: parseInt(process.env.BREAKER_ERRORS) || 50,
    reset: parseInt(process.env.BREAKER_RESET) || 5000
  });
};

// An error used to report a timeout
const TimeoutError = function(name, timeout) {
  Error.captureStackTrace(this);
  this.message = util.format(
    'Function %s timed out after %d ms', name, timeout);
};
TimeoutError.prototype = Error.prototype;

// An error used to report a circuit breaker fast-fail
const CircuitBreakerError = function(name) {
  Error.captureStackTrace(this);
  this.message = util.format(
    'Function %s failed-fast due to open circuit-breaker', name);
};
CircuitBreakerError.prototype = Error.prototype;

// Handle a call back to an application callback
const callback = (name, err, val, time, timeout, reject, circuit, cb) => {

  // Report function call metrics
  const now = Date.now();
  perf.report(name, now, now - time,
    err && err.nobreaker ? undefined : err, timeout, reject, circuit);

  // Call back
  return timeout ? cb(new TimeoutError(name, timeout), undefined) : reject ?
    cb(new CircuitBreakerError(name), undefined) : cb(err, val);
};

// Handle a call to an application function
const call = (name, fn, args, time, opt, circuit, cb) => {

  // Start a call timer to detect a timeout
  let timedout = false;
  const tid = setTimeout(() => {
    // Timed out
    timedout = true;
    debug('Function %s timed out after %d ms', name, opt.timeout);
    return callback(
      name, undefined, undefined, time, opt.timeout, false, circuit, cb);
  }, opt.timeout);

  // Call the app function with our own callback to intercept the result
  debug('Calling function %s', name);
  try {
    return fn.apply(undefined, args.concat([(err, val) => {
      // Stop here if the call already timed out
      if(timedout) return undefined;

      // Clear the call timer
      clearTimeout(tid);

      if (err) {
        edebug('Function %s calling back with error, %o', name, err);
        debug('Function %s calling back with error, %o', name, err);
      }
      else
        debug('Function %s calling back with success', name);

      // Call back
      return callback(name, err, val, time, 0, false, circuit, cb);
    }]));
  }
  catch (exc) {
    // Call back with an exception
    edebug('Function %s calling back with exception %o', name, exc);
    debug('Function %s calling back with exception %o', name, exc);
    return callback(name, exc, undefined, time, 0, false, circuit, cb);
  }
};

// Return a circuit breaker function for an application function.
const breakerfn = (fn, timeout, threshold, errors, reset) => {
  // Convert to a function with callback
  const fcb = yieldable.functioncb(fn);

  // Preserve the original function name
  const name = fcb.fname || fcb.name;

  // Process configuration options
  const opt = options(timeout, threshold, errors, reset);

  // The circuit state: open, closed or half-open
  // Warning: circuit is a mutable variable
  let circuit = 'closed';

  // Time when the circuit state changed to open
  let optime;

  // Create a wrapper function around the application function
  const wrapper = extend(function() {

    // Assume the usal function signature with a callback
    const cb = last(arguments);

    // Manage the circuit state
    const time = Date.now();
    if(circuit === 'closed') {

      // Retrieve the function call performance and reliability stats
      const h = last(perf.stats(name, time).health);
      const calls = h.ok + h.errors;
      const errors = h.errors / (h.ok + h.errors) * 100;

      // Call the application function when the circuit is closed
      // and we are under the circuit error rate
      if(calls < opt.threshold || errors < opt.errors)
        return call(name, fcb, initial(arguments), time, opt, circuit, cb);

      // Open the circuit when we reach the circuit max error rate
      // (we are above the volume threshold and error percentage)
      debug('Tripping circuit breaker for function %s, after %d calls and ' +
        '%d\% errors', name, calls, errors);
      circuit = 'open';
      optime = time;
    }
    if(circuit === 'open' && time - optime > opt.reset) {
      // Half-open the circuit after some time, and let one call
      // through to check if it's working again
      debug('Trying one test call to function %s', name);
      circuit = 'half-open';
      return call(
        name, fcb, initial(arguments), time, opt, circuit, (err, val) => {

          // Close the circuit if the call succeeds, re-open it on error
          if(!err) {
            // Reset the function call reliability stats
            perf.reset(name, time);
            circuit = 'closed';
          }
          else {
            circuit = 'open';
            optime = time;
          }
          return cb(err, val);
        });
    }

    // Fail fast when the circuit is open or half-open
    debug('Function %s failed fast, circuit is %s', name, circuit);
    return callback(name,
      undefined, undefined, time, 0, true, circuit, cb);
  }, {
    // Preserve the original function name
    fname: name
  });

  return wrapper;
};

// Bind a function to an object while preserving the original function name
const nbind = (o, k) => extend(bind(o[k], o), {
  fname: o[k].fname || (o.fname || o.name) + '.' + k
});

// Convert an application function to a circuit breaker function, if the given
// function is a module then convert all the module's exported functions as
// well.
const breaker = (fn, timeout, threshold, errors, reset) => extend(
    isFunction(fn) ? breakerfn(fn, timeout, threshold, errors, reset) : {},
    object(pairs(fn)), object(map(functions(fn),
      (k) => [k, breakerfn(nbind(fn, k), timeout, threshold, errors, reset)])));

// Export our public functions
module.exports = breaker;
module.exports.TimeoutError = TimeoutError;
module.exports.CircuitBreakerError = CircuitBreakerError;

