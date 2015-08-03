'use strict';

// Simple function wrapper that batches Node-style calls.

// Batching is achieved by wrapping a function in logic that records calls in
// a batch for some time, then calls that function once with the accumulated
// batch, giving it an opportunity to process all the calls efficiently at
// once. Unbatching takes a batch of calls, applies them individually to a
// function, then returns a batch of results.

const _ = require('underscore');
const yieldable = require('abacus-yieldable');

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

// Setup debug log
const debug = require('abacus-debug')('abacus-batch');

// Return a function that records calls for some time and presents the whole
// list of calls later to the given batch function
const batchifyfn = (fn, delay) => {
    // Use a default batch time window of 20 msec
    const timeout = delay === undefined ? 20 : delay;

    // Convert to a function with callback
    const fcb = yieldable.functioncb(fn);

    // Warning: calls is a mutable variable, but that's by design as we're
    // using it to record and accumulate function calls
    let calls = [];

    // Determine the application function name
    const name = fcb.fname || fcb.name;

    const wrapper = function() {
        // Record each call arguments in our list of calls
        const call = map(arguments, identity);
        debug('Recording function call to %s', name);
        // Warning: mutating variable calls, by design
        calls.push(call);

        // Use a timer to decide  when to pass the list of calls to the batch
        // function
        if(calls.length === 1)
            setTimeout(() => {
                const bcalls = calls;
                // Warning: mutating variable calls, by design again
                calls = [];

                // Pass the list of calls to the batch function
                debug('Calling batch function %s with %d batched calls', name, bcalls.length);
                fcb(map(bcalls, (call) => initial(call)), (err, vals) => {
                    // Pass each call result to the corresponding callback
                    debug('Returning %d batch function results', vals ? vals.length : undefined);
                    return map(zip(bcalls, vals), (call) => last(call[0]).apply(undefined, err ? [err] : call[1]));
                });
            }, timeout);
    };

    // Store the application function name in the wrapper function
    wrapper.fname = name;

    return wrapper;
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
const nbind = (o, k) => extend(bind(o[k], o), { fname: (o.name || o.fname ? (o.name || o.fname) + '.' : '') + (o[k].name || o[k].fname || k) });

// Convert an application function using batchifyfn, if the given function is a
// module then convert all the functions under the module's batch property as
// well.
const batchify = (fn, timeout) => extend(
    isFunction(fn) ? batchifyfn(fn, timeout) : {},
    object(pairs(fn)),
    object(map(filter(functions(fn), (k) => /^batch_/.test(k)), (k) => [k.substr(6), batchifyfn(nbind(fn, k), timeout)])));

// Export our public functions
module.exports = batchify;
module.exports.batchify = batchify;
module.exports.unbatchify = unbatchify;

