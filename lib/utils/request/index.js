'use strict';

// Simple wrapper around the popular Node request module, adding some logging
// and Express-like route URI templates

const _ = require('underscore');
const http = require('http');
const https = require('https');
const req = require('request');

const clone = _.clone;
const extend = _.extend;

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

// Convert request params to the options object expected by the request module
// uri, options and cb are all optional, but uri is expected to be given either
// as the uri parameter or as a field in the options parameter
const options = (uri, opt, cb) => {
    const callback = typeof opt === 'function' && !cb ? opt : cb;

    let opts;
    if (typeof opt === 'object') {
        opts = clone(opt);
        opts.route = uri;
    }
    else if (typeof uri === 'string') {
        opts = {};
        opts.route = uri;
    }
    else {
        opts = clone(uri);
        if(!opts.route)
            opts.route = opts.uri;
    }

    // Inject specified parameter values into the URL
    opts.uri = route(opts.route, opts);

    // Default to JSON mime type
    opts.json = true;

    return { uri: opts.uri, options: opts, callback: callback };
};

// Simple wrapper around the request module function, use like this:
// request('http://localhost/whatever/:x/:y', { x: 10, y: 20 }, (err, res) => {
//     ... do something with res, res is a Javascript object parsed from the JSON response
// });
const request = (uri, opts, cb) => {
    const target = options(uri, opts, cb);

    // Send the request
    debug('Sending %s request %s' + (target.options.body ? ' %o' : '%s'), target.options.method, target.uri, target.options.body ? target.options.body : '');
    return req(extend(clone(target.options), { rejectUnauthorized: false }), (err, res, body) => {
        // Call back with the response
        if(err) {
            debug('Request error %o', err);
            target.callback(err, undefined);
        }
        else {
            debug('Received %s response %d' + (res.body ? ' %o' : '%s'), target.options.method, res.statusCode, res.body ? res.body : '');
            if(res.statusCode >= 500 && res.statusCode <= 599) {
                const e5x = new Error(res.body && res.body.message ? res.body.message : 'HTTP response status code ' + res.statusCode);
                // Warning: mutating variable err as that's really the simplest
                // way to set its code property without having to get into the
                // mess of creating a subclass of Error
                e5x.code = res.statusCode;

                target.callback(e5x, undefined);
            } else target.callback(undefined, res);
        }
    });
};

// Create a wrapper function for an HTTP verb
const method = (m) => {
    return (uri, opts, cb) => {
        const target = options(uri, opts, cb);
        target.options.method = m;
        return request(target.options, target.callback);
    };
};

// Create a wrapper function for an HTTP verb that calls back right away and
// discards any HTTP result
const noresmethod = (m) => {
    return (uri, opts, cb) => {
        const target = options(uri, opts, cb);
        target.options.method = m;
        request(target.options, (err, val) => {
            if(err) debug('No-result method discarding error %o', err);
        });
        process.nextTick(() => target.callback(undefined, undefined));
    };
};

// Shorthand functions for the various HTTP methods
const get = method('GET');
const head = method('HEAD');
const patch = method('PATCH');
const post = method('POST');
const norespost = noresmethod('POST');
const put = method('PUT');
const del = method('DELETE');
const opt = method('OPTIONS');

// Return a function that pings a URL, useful to wait for the availability of
// an application in test cases for example. Ping be invoked repeatedly in a
// Jest waitsFor condition without flooding the target URL with requests, as
// it will only ping that URL every 250 msec.

// Warning: pings is a mutable variable, used to record ping times and the
// corresponding responses
let pings = [];

const ping = (uri, opt) => {
    const cb = function(err, val) {
        // Warning: mutating variable pings
        if(!err) {
            pings[target.uri].val = val;
            pings[target.uri].count = (pings[target.uri].count || 0) + 1;
        }
        else pings[target.uri].count = 0;
    };

    const target = options(uri, opt ? opt : cb, opt ? cb : undefined);

    // Warning: mutating variable pings
    pings[target.uri] = pings[target.uri] || { t: Date.now() };

    if(Date.now() - pings[target.uri].t >= 250) {
        // Warning: mutating variable pings
        pings[target.uri].t = Date.now();
        request.options(target.uri, target.options, target.callback);
    }
    return pings[target.uri].count || 0;
};

// Ping the target URI every 250 msec
const waitFor = (uri, opt, cb) => {
    const target = options(uri, opt, cb);

    debug('Pinging %s', target.uri);
    const i = setInterval(() => {
        const n = request.ping(target.uri, target.options);
        if(n !== 0) debug('%d successful pings', n);
        if(n === 5) {
            // Call back after 5 successful pings
            clearInterval(i);
            clearTimeout(t);
            target.callback(undefined, target.uri);
        }
    }, 250);

    // Time out after 5 sec
    const t = setTimeout(() => {
        debug('Timed out');
        clearInterval(i);
        target.callback(new Error('timeout'));
    }, 5000);
};

// Export our public functions
module.exports = request;
module.exports.route = route;
module.exports.get = get;
module.exports.head = head;
module.exports.patch = patch;
module.exports.post = post;
module.exports.norespost = norespost;
module.exports.put = put;
module.exports.del = del;
module.exports.delete = del;
module.exports.options = opt;
module.exports.ping = ping;
module.exports.waitFor = waitFor;

