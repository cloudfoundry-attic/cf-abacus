'use strict';

// Simple function wrapper that batches Node-style calls.

// Batching is achieved by wrapping a function in logic that records calls in
// a batch for some time, then calls that function once with the accumulated
// batch, giving it an opportunity to process all the calls efficiently at
// once. Unbatching takes a batch of calls, applies them individually to a
// function, then returns a batch of results.

const _ = require('underscore');
const yieldable = require('abacus-yieldable');
const transform = require('abacus-transform');

const map = _.map;
const identity = _.identity;
const initial = _.initial;
const zip = _.zip;
const last = _.last;
const extend = _.extend;
const isFunction = _.isFunction;
const object = _.object;
const pairs = _.pairs;
const functions = _.functions;
const bind = _.bind;
const filter = _.filter;
const values = _.values;
const flatten = _.flatten;
const groupBy = _.groupBy;
const sortBy = _.sortBy;

// Setup debug log
const debug = require('abacus-debug')('abacus-batch');

// Return a function that records calls for some time and presents the whole
// list of calls later to the given batch function
const batchifyfn = (fn, delay, max, size) => {
  // Use a default batch time window of 20 msec
  const timeout = delay === undefined ? 20 : delay;
  const msize = max === undefined ? 100 : max;
  const csize = size === undefined ? () => 1 : size;

  // Convert to a function with callback
  const fcb = yieldable.functioncb(fn);

  // Warning: bcalls and bsize are mutable variables, but that's by design
  // as we're using them to record and accumulate function calls
  let bcalls = [];
  let bsize = 0;

  // Warning: tid is a mutable variable, by design again as it's used to
  // record the id of the batching timeout
  let tid;

  // Flush a batch of recorded calls
  const flush = () => {
    const fcalls = bcalls;
    // Warning: mutating variables bcalls and bsize, by design again
    bcalls = [];
    bsize = 0;

    // Pass the list of calls to the batch function
    debug(
      'Calling batch function %s with %d batched calls', name, fcalls.length);
    fcb(map(fcalls, (call) => initial(call)), (err, vals) => {
      if(err)
        debug('Returning %d batch function results with error %o',
          vals ? vals.length : 0, err);
        else
        debug('Returning %d batch function results',
          vals ? vals.length : 0);

      // Pass each call result to the corresponding callback
      return map(zip(fcalls, vals),
        (call) => last(call[0]).apply(undefined, err ? [err] : call[1]));
    });
  };

  // Determine the application function name
  const name = fcb.fname || fcb.name;

  const wrapper = function() {
    // Record each call arguments in our list of calls
    const call = map(arguments, identity);
    debug('Recording function call to %s', name);
    // Warning: mutating variable bcalls, by design
    bcalls.push(call);

    // Add the size of each call to the batch size
    bsize += csize(name, call);

    // Use a timer to decide  when to pass the list of calls to the batch
    // function
    if(bcalls.length === 1)
      tid = setTimeout(flush, timeout);

    if(bsize >= msize) {
      if(tid) clearTimeout(tid);
      flush();
    }
  };

  // Store the application function name in the wrapper function
  wrapper.fname = name;

  return wrapper;
};

// Return a function that organizes a batch of calls in groups, applies each
// group of calls and assembles the results
const groupfn = (fn, group) => {

  // Convert the given functions to functions with callback
  const fcb = yieldable.functioncb(fn);
  const gcb = yieldable.functioncb(group);

  return (calls, cb) => {
    // Build a map of call requests to target group keys
    transform.map(calls, (call, i, calls, mcb) => {
      gcb(call, (err, k) => err ? mcb(err) : mcb(undefined, {
        i: i,
        call: call,
        k: k
      }));

    }, (err, maps) => {
      if(err) return cb(err);

      // Group the call maps by group key
      const groups = values(groupBy(maps, (map) => map.k));

      // Apply the requested batch function to each group of call requests
      transform.map(groups, (gmaps, i, groups, mcb) => {

        // Return a zip of the call requests and corresponding results
        fcb(map(gmaps, (gmap) => gmap.call),
          (err, gres) => err ? mcb(err) : mcb(undefined, zip(gmaps, gres)));

      }, (err, gres) => {
        if(err) return cb(err);

        // Assemble the results into a single list of results ordered
        // like the call requests
        cb(undefined, map(
          sortBy(flatten(gres, true), (res) => res[0].i), (res) => res[1]));
      });
    });
  };
};

// Return a function that takes a list of calls, applies each individual call
// to a function and returns a list of results
const unbatchify = (fn) => {
  // Convert to a function with callback
  const fcb = yieldable.functioncb(fn);

  return (calls, cb) => {
    debug('Applying batch of %d function calls', calls.length);
    // Warning: count is a mutable variable, but that's by design as we
    // need to count results from the individual function calls
    let count = 0;
    // Warning: count is a mutable variable, but that's by design as we
    // need to collect results from the individual function calls
    let vals = [];

    // Apply each function call
    map(calls, (call, i) => {
      fcb.apply(undefined, call.concat([(err, val) => {
        // Collect function call result
        debug('Collecting function result %d', i);
        // Warning: mutating variable vals
        vals[i] = [err, val];
        // Warning: mutating variable count
        count++;
        // Call back when we've collected all the results
        if(count === calls.length) {
          debug('Calling back with %d batch function results', count);
          cb(undefined, vals);
        }
      }]));
    });
  };
};

// Bind a function to an object while retaining the function name
const nbind = (o, k) => extend(bind(o[k], o), {
  fname: (o.name || o.fname ? (o.name || o.fname) + '.' : '') + (o[k].name ||
      o[k].fname || k)
});

// Convert an application function using batchifyfn, if the given function is
// a module then convert all the functions exported by the module named like
// batch_* as well.
const batchify = (fn, delay, max, size) => extend(isFunction(fn) ?
    batchifyfn(fn, delay, max, size) : {}, object(pairs(fn)),
      object(map(filter(functions(fn), (k) => /^batch_/.test(k)),
        (k) => [k.substr(6), batchifyfn(nbind(fn, k), delay, max, size)])));

// Export our public functions
module.exports = batchify;
module.exports.batchify = batchify;
module.exports.unbatchify = unbatchify;
module.exports.groupBy = groupfn;

