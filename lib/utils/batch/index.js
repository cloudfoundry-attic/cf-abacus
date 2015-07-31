'use strict';

// Simple function wrapper that batches Node-style calls.

// Batching is achieved by wrapping a function in logic that records calls in
// a batch for some time, then calls that function once with the accumulated
// batch, giving it an opportunity to process all the calls efficiently at
// once. Unbatching takes a batch of calls, applies them individually to a
// function, then returns a batch of results.

var _ = require('underscore');
var yieldable = require('cf-abacus-yieldable');

var map = _.map;
var identity = _.identity;
var initial = _.initial;
var zip = _.zip;
var last = _.last;
var extend = _.extend;
var isFunction = _.isFunction;
var object = _.object;
var pairs = _.pairs;
var functions = _.functions;
var bind = _.bind;
var filter = _.filter;

// Setup debug log
var debug = require('cf-abacus-debug')('cf-abacus-batch');

// Return a function that records calls for some time and presents the whole
// list of calls later to the given batch function
var batchifyfn = function batchifyfn(fn, delay) {
    // Use a default batch time window of 20 msec
    var timeout = delay === undefined ? 20 : delay;

    // Convert to a function with callback
    var fcb = yieldable.functioncb(fn);

    // Warning: calls is a mutable variable, but that's by design as we're
    // using it to record and accumulate function calls
    var calls = [];

    // Determine the application function name
    var name = fcb.fname || fcb.name;

    var wrapper = function wrapper() {
        // Record each call arguments in our list of calls
        var call = map(arguments, identity);
        debug('Recording function call to %s', name);
        // Warning: mutating variable calls, by design
        calls.push(call);

        // Use a timer to decide  when to pass the list of calls to the batch
        // function
        if (calls.length === 1) setTimeout(function () {
            var bcalls = calls;
            // Warning: mutating variable calls, by design again
            calls = [];

            // Pass the list of calls to the batch function
            debug('Calling batch function %s with %d batched calls', name, bcalls.length);
            fcb(map(bcalls, function (call) {
                return initial(call);
            }), function (err, vals) {
                // Pass each call result to the corresponding callback
                debug('Returning %d batch function results', vals ? vals.length : undefined);
                return map(zip(bcalls, vals), function (call) {
                    return last(call[0]).apply(undefined, err ? [err] : call[1]);
                });
            });
        }, timeout);
    };

    // Store the application function name in the wrapper function
    wrapper.fname = name;

    return wrapper;
};

// Return a function that takes a list of calls, applies each individual call
// to a function and returns a list of results
var unbatchify = function unbatchify(fn) {
    // Convert to a function with callback
    var fcb = yieldable.functioncb(fn);

    return function (calls, cb) {
        debug('Applying batch of %d function calls', calls.length);
        // Warning: count is a mutable variable, but that's by design as we
        // need to count results from the individual function calls
        var count = 0;
        // Warning: count is a mutable variable, but that's by design as we
        // need to collect results from the individual function calls
        var vals = [];

        // Apply each function call
        map(calls, function (call, i) {
            fcb.apply(undefined, call.concat([function (err, val) {
                // Collect function call result
                debug('Collecting function result %d', i);
                // Warning: mutating variable vals
                vals[i] = [err, val];
                // Warning: mutating variable count
                count++;
                // Call back when we've collected all the results
                if (count === calls.length) {
                    debug('Calling back with %d batch function results', count);
                    cb(undefined, vals);
                }
            }]));
        });
    };
};

// Bind a function to an object while retaining the function name
var nbind = function nbind(o, k) {
    return extend(bind(o[k], o), { fname: (o.name || o.fname ? (o.name || o.fname) + '.' : '') + (o[k].name || o[k].fname || k) });
};

// Convert an application function using batchifyfn, if the given function is a
// module then convert all the functions under the module's batch property as
// well.
var batchify = function batchify(fn, timeout) {
    return extend(isFunction(fn) ? batchifyfn(fn, timeout) : {}, object(pairs(fn)), object(map(filter(functions(fn), function (k) {
        return (/^batch_/.test(k)
        );
    }), function (k) {
        return [k.substr(6), batchifyfn(nbind(fn, k), timeout)];
    })));
};

// Export our public functions
module.exports = batchify;
module.exports.batchify = batchify;
module.exports.unbatchify = unbatchify;