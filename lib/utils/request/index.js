'use strict';

// Simple wrapper around the popular Node request module, adding some logging
// and Express-like route URI templates

const _ = require('underscore');
const http = require('http');
const https = require('https');
const _request = require('request');
const transform = require('cf-abacus-transform');
const url = require('url');

const clone = _.clone;
const extend = _.extend;
const map = _.map;
const groupBy = _.groupBy;
const pick = _.pick;
const flatten = _.flatten;
const sortBy = _.sortBy;

/* jshint undef: false */
/* jshint unused: false */

// Setup debug log
const debug = require('cf-abacus-debug')('cf-abacus-request');

// Bump up the max number of sockets
if(!process.browser) {
    http.globalAgent.maxSockets = Infinity;
    https.globalAgent.maxSockets = Infinity;
}

// Generates a URI from an Express-like URI template, use like this:
// request.route('http://.../:x/:y', { x: 1, y: 2 });
// returns http://.../1/2
const route = (template, parms) => {
    return template.replace(/:[a-z_][a-z0-9_]*/ig, (name) => parms[name.substr(1)]);
};

// Convert request params to a request target configuration, uri, options and
// cb are all optional, but uri is expected to be given either as the uri
// parameter or as a field in the options parameter
const target = (m, uri, opt, cb) => {
    const callback = typeof opt === 'function' && !cb ? opt : cb;

    // Return the default options
    const defopts = () => ({ json: true, rejectUnauthorized: false });

    // Compute the default options
    const options = (uri, opt) => {
        if (typeof opt === 'object')
            return extend(defopts(), clone(opt), { route: uri });
        if (typeof uri === 'string')
            return extend(defopts(), { route: uri });
        return extend(defopts(), uri, { route: uri.route || uri.uri });
    };

    // Resolve the route URI
    const resolve = (opts) => extend(clone(opts), { uri: route(opts.route, opts) });

    // Determine the target method
    const method = (m, opts) => extend(clone(opts), m ? { method: m } : {});

    // Return the request target configuration
    const opts = method(m, resolve(options(uri, opt)));

    return { uri: opts.uri, options: opts, callback: callback };
};

// Convert an HTTP result with an error status code to an exception
const httpexc = (res) => {
    const exc = new Error(res.body && res.body.message ? res.body.message : 'HTTP response status code ' + res.statusCode);
    // Warning: mutating variable err as that's really the simplest
    // way to set its code property without having to get into the
    // mess of creating a subclass of Error
    exc.code = res.statusCode;
    return exc;
};

// Simple wrapper around the request module function, use like this:
// request('http://localhost/whatever/:x/:y', { x: 10, y: 20 }, (err, res) => {
//     ... do something with res, res is a Javascript object parsed from the JSON response
// });
const request = (uri, opts, cb) => {
    // Convert the input parameters to a request target configuration
    const t = target(undefined, uri, opts, cb);

    // Send the request
    debug('Sending %s request %s' + (t.options.body ? ' %o' : '%s'), t.options.method, t.uri, t.options.body ? t.options.body : '');
    _request(t.options, (err, res) => {
        // Call back with the response
        if(err) {
            debug('Request error %o', err);
            if(t.options.nowait)
                return;
            t.callback(err, undefined);
        }
        else {
            debug('Received %s response %d' + (res.body ? ' %o' : '%s'), t.options.method, res.statusCode, res.body ? res.body : '');
            if(t.options.nowait)
                return;
            if(res.statusCode >= 500 && res.statusCode <= 599)
                t.callback(httpexc(res), undefined);
            else
                t.callback(undefined, res);
        }
    });

    // Call back immediately if the caller specified the nowait option
    if(t.options.nowait)
        process.nextTick(() => t.callback(undefined, undefined));
};

// Return a function that will send a request with the given HTTP method
const singleOp = (m, opt) => {
    return (uri, opts, cb) => {
        const t = target(m, uri, opts, cb);
        t.options = extend(t.options, opt);
        return request(t.options, t.callback);
    };
};

// Return a function that will send a batch of requests with the given HTTP
// method
const batchOp = (m, opt) => {
    // Batches are sent using an HTTP POST
    const post = singleOp('POST', opt);

    return (reqs, cb) => {
        debug('Sending a batch of %d %s requests', reqs.length, m);

        // Return each request with its index in the list and the corresponding
        // target request options
        const targets = map(reqs, (args, i, reqs) => ({ i: i, opt: target(m, args[0], args[1], args[2]) }));

        // Group the calls by target protocol, auth and host
        const groups = map(groupBy(targets, (t) => url.resolve(t.opt.uri, '/')));

        // Send a single HTTP request per group
        transform.map(groups, (group, g, groups, gcb) => {
            // Build the request body
            const greq = map(group, (r) => extend({ uri: url.parse(r.opt.uri).path }, pick(r.opt.options, 'method', 'headers', 'json', 'body')));

            // Send the POST request to the target's host /batch path
            post(url.resolve(group[0].opt.uri, '/batch'), { body: greq }, (err, res) => {
                if(err) return gcb(err);

                // Return the list of results from the response body
                if(res)
                    gcb(undefined, map(res.body, (r, i) => ({ i: group[i].i,
                        res: r.statusCode >= 500 && r.statusCode <= 599 ? [httpexc(r), undefined] :
                            [undefined, { statusCode: r.statusCode || 200, headers: r.headers || [], body: r.body }]})));
                else
                    gcb(undefined, map(group, (g) => ({ i: g.i, res: [undefined, undefined] })));
            });

        }, (err, gres) => {
            if(err) cb(err);

            // Return assembled list of results from the list of groups, sorted
            // like the corresponding requests
            const res = map(sortBy(flatten(gres, true), (r) => r.i), (r) => r.res);
            cb(undefined, res);
        });
    };
};

// Shorthand functions for the various HTTP methods
extend(request, {
    get: singleOp('GET'), head: singleOp('HEAD'), patch: singleOp('PATCH'), options: singleOp('OPTIONS'),
    post: singleOp('POST'), put: singleOp('PUT'), del: singleOp('DELETE'), delete: singleOp('DELETE'),
    noWaitPost: singleOp('POST', { nowait: true }),

    // Batch versions of the HTTP methods, for use with the batch module
    batch_get: batchOp('GET'), batch_head: batchOp('HEAD'), batch_patch: batchOp('PATCH'),
    batch_post: batchOp('POST'), batch_put: batchOp('PUT'), batch_del: batchOp('DELETE'), batch_delete: batchOp('DELETE'),
    batch_noWaitPost: batchOp('POST', { nowait: true})
});

// Return a function that pings a URL, useful to wait for the availability of
// an application in test cases for example. Ping can be invoked repeatedly
// Jest waitsFor condition for example without flooding the target URL with
// requests, as it will only ping that URL every 250 msec.

// Warning: pings is a mutable variable, used to record ping times and the
// corresponding responses
let pings = [];

const ping = (uri, opt) => {
    const cb = function(err, val) {
        // Warning: mutating variable pings
        if(!err) {
            pings[t.uri].val = val;
            pings[t.uri].count = (pings[t.uri].count || 0) + 1;
        }
        else pings[t.uri].count = 0;
    };

    const t = target(undefined, uri, opt ? opt : cb, opt ? cb : undefined);

    // Warning: mutating variable pings
    pings[t.uri] = pings[t.uri] || { t: Date.now() };

    if(Date.now() - pings[t.uri].t >= 250) {
        // Warning: mutating variable pings
        pings[t.uri].t = Date.now();
        request.options(t.uri, t.options, t.callback);
    }
    return pings[t.uri].count || 0;
};

// Ping the target URI every 250 msec and wait for it to become available
const waitFor = (uri, opt, cb) => {
    const t = target(undefined, uri, opt, cb);

    debug('Pinging %s', t.uri);
    const i = setInterval(() => {
        const n = request.ping(t.uri, t.options);
        if(n !== 0) debug('%d successful pings', n);
        if(n === 5) {
            // Call back after 5 successful pings
            clearInterval(i);
            clearTimeout(to);
            t.callback(undefined, t.uri);
        }
    }, 250);

    // Time out after 5 sec
    const to = setTimeout(() => {
        debug('Timed out');
        clearInterval(i);
        t.callback(new Error('timeout'));
    }, 5000);
};

// Export our public functions
module.exports = request;
module.exports.route = route;
module.exports.ping = ping;
module.exports.waitFor = waitFor;

