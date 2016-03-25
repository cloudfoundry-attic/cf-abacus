'use strict';

// Small utility that converts Node callback based functions to generators that
// are yieldable from co flow functions.

// Initialize the Babel polyfill if needed
if(!global.regeneratorRuntime)
  require('babel-polyfill');

const _ = require('underscore');
const thunkify = require('thunkify');
const co = require('co');

const extend = _.extend;
const isFunction = _.isFunction;
const isObject = _.isObject;
const object = _.object;
const pairs = _.pairs;
const map = _.map;
const functions = _.functions;
const rest = _.rest;
const bind = _.bind;

// Return true if the given function is a generator
const isGenerator = (fn) => isFunction(fn) && Object.getPrototypeOf(fn) !==
  Object.getPrototypeOf(Function);

// Return true if the given function is actually a promise
const isPromise = (fn) => isObject(fn) && isFunction(fn.then);

// Convert a value to a function that returns that value
const thunk = (value) => (cb) => cb(undefined, value);

// Thunkify a function while preserving its name
const nthunkify = (fn) => extend(thunkify(fn), {
  fname: fn.name || fn.fname
});

// Convert a function to an ES6 stream generator that will generate a stream
// containing the single result of that function. The input function must be
// a thunkifed function (a function that returns a thunk).
const generator = (fn) => {
  // Return a generator as is
  if(isGenerator(fn))
    return fn;

  // Convert to a generator
  return extend(function *() {
    return yield fn.apply(null, rest(arguments, 0));
  }, {
    // Preserve the original function name
    fname: fn.fname || fn.name
  });
};

// Convert the given function to a regular Node function taking a callback.
// Supports regular Node functions (returned as is), generators (converted
// using co), and promises.
const functioncb = (fn) => {
  // Convert an ES6 stream generator to a function with callback using co
  if(isGenerator(fn))
    return extend(co(fn), {
      // Preserve the original function name
      fname: fn.fname || fn.name
    });

  // Convert a promise to a function with callback
  if(isPromise(fn)) 
    return extend(
      (cb) => fn.then((val) => cb(null, val)).catch((err) => cb(err)), {
        // Preserve the original function name
        fname: fn.fname || fn.name
      });

  // Return a regular function with callback as is
  return fn;
};

// Convert a function with callback or a generator to a function that returns
// a promise
const promise = (fn) => {
  return extend(function() {
    const a = rest(arguments, 0);
    return new Promise((resolve, reject) =>
      functioncb(fn).apply(null, a.concat(
        [(err, val) => err ? reject(err) : resolve(val)])));
  }, {
    // Preserve the original function name
    fname: fn.fname || fn.name
  });
};

// Bind a function to an object while preserving the original function name
const nbind = (o, k) => extend(bind(o[k], o), {
  fname: o[k].fname || (o.fname || o.name) + '.' + k
});

// Convert a regular Node function with callback to an ES6 stream generator
// that will generate a stream containing the single result of that function.
const yieldable = (fn) => {
  // Return a generator as is
  if(isGenerator(fn))
    return fn;

  // Convert a promise
  if(isPromise(fn))
    return generator(nthunkify(functioncb(fn)));

  // Convert a regular function with callback or a module exporting regular
  // functions with callback
  return extend(isFunction(fn) ? generator(nthunkify(fn)) : {},
    object(pairs(fn)), object(map(functions(fn),
      (k) => [k, generator(nthunkify(nbind(fn, k)))])));
};

// Export our public functions
module.exports = yieldable;
module.exports.thunk = thunk;
module.exports.functioncb = functioncb;
module.exports.promise = promise;

