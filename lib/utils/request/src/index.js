'use strict';

// Simple wrapper around the popular Node request module, adding some logging
// and Express-like route URI templates

const _ = require('underscore');
const request = require('request');
const transform = require('abacus-transform');
const lrudown = require('abacus-lrudown');
const levelup = require('levelup');
const url = require('url');

const clone = _.clone;
const extend = _.extend;
const map = _.map;
const groupBy = _.groupBy;
const pick = _.pick;
const flatten = _.flatten;
const sortBy = _.sortBy;
const memoize = _.memoize;
const filter = _.filter;
const find = _.find;

/* jshint undef: false */
/* jshint unused: false */

// Setup debug log
const debug = require('abacus-debug')('abacus-request');

// Generates a URI from an Express-like URI template, use like this:
// request.route('http://.../:x/:y', { x: 1, y: 2 });
// returns http://.../1/2
const route = (template, parms) => {
  return template.replace(
    /:[a-z_][a-z0-9_]*/ig, (name) => parms[name.substr(1)]);
};

// Setup request default options
const drequest = request.defaults({
    json: true,
    rejectUnauthorized: false,
    forever: true,
    pool: {
      maxSockets: 1000
    }
});

// Convert request params to a request target configuration, uri, options and
// cb are all optional, but uri is expected to be given either as the uri
// parameter or as a field in the options parameter
const target = (m, uri, opt, cb) => {
  const callback = typeof opt === 'function' && !cb ? opt : cb;

  // Compute the default options
  const options = (uri, opt) => {
    if(typeof opt === 'object')
      return extend(clone(opt), {
        route: uri
      });
    if(typeof uri === 'string')
      return {
        route: uri
      };
    return extend(clone(uri), {
      route: uri.route || uri.uri
    });
  };

  // Resolve the route URI
  const resolve = (opts) => extend(clone(opts), {
      uri: route(opts.route, opts)
    });

  // Determine the target method
  const method = (m, opts) => extend(clone(opts), m ? {
      method: m
    } : {});

  // Return the request target configuration
  const opts = method(m, resolve(options(uri, opt)));

  return {
    uri: opts.uri,
    options: opts,
    callback: callback
  };
};

// Return true if the given request target and response are cacheable
const cacheable = (t, res) => {
  if(!t.options.cache || t.options.method !== undefined &&
      t.options.method !== 'GET')
    return false;
  if(res && res.statusCode !== undefined && res.statusCode !== 200)
    return false;
  return true;
};

// Return an lrudown cache db
const cache = memoize(() => {
  const db = levelup('abacus-request-cache', {
    db: (loc) => new lrudown(loc)
  });

  return {
    // Look for a cached GET response
    get: (t, cb) => {
      return db.get(t.uri, (err, res) => {
        if(err) {
          debug(
            'Didn\'t find %s %s response in cache', t.options.method, t.uri);
          return cb(err);
        }

        // Return the cached response
        debug('Found %s %s response in cache %d %o', t.options.method,
          t.uri, res.statusCode || 200, res.body ? res.body : '');
        return cb(undefined, JSON.parse(res));
      });
    },

    // Cache a GET response
    put: (t, res, cb) => {
      return db.put(t.uri, JSON.stringify(
        pick(res, 'statusCode', 'cookies', 'headers', 'body')), () => {
          debug('Cached %s %s response %d %o', t.options.method,
            t.uri, res.statusCode || 200, res.body ? res.body : '');
          cb(undefined, res);
        });
    }
  };
});

// Convert an HTTP result with an error status code to an exception
const httpexc = (res) => {
  const exc = new Error(res.body && res.body.message ? res.body.message :
    'HTTP response status code ' + res.statusCode);
  // Warning: mutating variable err as that's really the simplest
  // way to set its code property without having to get into the
  // mess of creating a subclass of Error
  exc.code = res.statusCode;
  return exc;
};

// Simple wrapper around the request module function, use like this:
// request('http://localhost/whatever/:x/:y', { x: 10, y: 20 }, (err, res) => {
//   do something with res, res is a Javascript object parsed from the
//   JSON response
// });
const xrequest = (uri, opts, cb) => {
  // Convert the input parameters to a request target configuration
  const t = target(undefined, uri, opts, cb);

  // Send the request
  const send = (t) => {
    debug('Sending %s request %s %o',
        t.options.method, t.uri, t.options.body || '');
    drequest(t.options, (err, res) => {
      // Call back with the response
      if(err) {
        debug('Request error %o', err);
        return callback(t, () => t.callback(err, undefined));
      }

      debug('Received %s response %d %o',
        t.options.method, res.statusCode, res.body || '');
      callback(t, () => {
        if(res.statusCode >= 500 && res.statusCode <= 599)
          return t.callback(httpexc(res), undefined);

        // Optionally cache GET responses
        if(cacheable(t, res))
          return cache().put(t, res, (err, res) => t.callback(err, res));

        return t.callback(undefined, res);
      });
    });

    // Call back immediately if the caller specified the nowait option
    if(t.options.nowait)
      process.nextTick(() => t.callback(undefined, undefined));
  };

  // Optionally callback with a response
  const callback = (t, cb) => {
    if(t.options.nowait)
      return;
    cb();
  };

  // Optionally look for a cached GET response
  if(cacheable(t))
    return cache().get(t, (err, res) => {
      if(err) return send(t);
      return t.callback(undefined, res);
    });

  // If not cacheable just sent the request
  return send(t);
};

// Return a function that will send a request with the given HTTP method
const singleOp = (m, opt) => {
  return (uri, opts, cb) => {
    const t = target(m, uri, opts, cb);
    t.options = extend(t.options, opt);
    return xrequest(t.options, t.callback);
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
    const targets = map(reqs, (args, i, reqs) => ({
        i: i,
        target: target(m, args[0], args[1], args[2])
    }));

    // Optionally lookup cached GET responses
    transform.map(targets, (t, i, targets, ccb) => {
      if(cacheable(t.target))
        return cache().get(t.target, (err, res) => {
          if(err) return ccb(undefined, t);
          ccb(undefined, extend(clone(t), {
            cached: [undefined, res]
          }));
        });

      return ccb(undefined, t);

    }, (err, res) => {
      if(err) cb(err);

      // Collect the cached vs not-cached responses
      const cached = map(filter(res, (t) => t.cached), (r) => ({
          i: r.i,
          res: r.cached
      }));
      const targets = filter(res, (t) => !t.cached);

      // Send the remaining requests, group the calls by target
      // protocol, auth and host
      const groups = map(groupBy(
        targets, (t) => url.resolve(t.target.uri, '/')));

      // Send a single HTTP request per group
      transform.map(groups, (group, g, groups, gcb) => {
        // Build the request body
        const greq = map(group, (t) => extend({
            uri: url.parse(t.target.uri).path
          }, pick(t.target.options, 'method', 'headers', 'json', 'body')));

        // Send the POST request to the target's host /batch path
        post(url.resolve(group[0].target.uri, '/batch'), {
          body: greq
        }, (err, res) => {
          if(err) return gcb(err);

          // Return the list of results from the response body
          if(res)
            gcb(undefined, map(res.body, (r, i) => {
              if(r.statusCode >= 500 && r.statusCode <= 599)
                return {
                  i: group[i].i,
                  res: [httpexc(r), undefined]
                };
              return {
                i: group[i].i,
                res: [undefined, {
                  statusCode: r.statusCode || 200,
                  headers: r.headers || [],
                  body: r.body
                }]
              };
            }));
          else
            gcb(undefined, map(group, (g) => ({
                i: g.i,
                res: [undefined, undefined]
            })));
        });

      }, (err, gres) => {
        if(err) cb(err);

        // Optionally cache GET responses
        const fgres = flatten(gres, true);
        transform.map(fgres, (r, i, fgres, rcb) => {
          const t = find(targets, (t) => t.i === r.i);
          if(cacheable(t.target, r.res[1]))
            return cache().put(t.target, r.res[1], rcb);
          return rcb();
        }, () => {

          // Return assembled list of results from the cached list and
          // the list of groups, sorted like the corresponding requests
          const res = map(sortBy(cached.concat(fgres), (r) => r
              .i), (r) => r.res);
          cb(undefined, res);
        });
      });
    });
  };
};

// Shorthand functions for the various HTTP methods
extend(xrequest, {
  get: singleOp('GET'),
  head: singleOp('HEAD'),
  patch: singleOp('PATCH'),
  options: singleOp('OPTIONS'),
  post: singleOp('POST'),
  put: singleOp('PUT'),
  del: singleOp('DELETE'),
  delete: singleOp('DELETE'),
  noWaitPost: singleOp('POST', {
    nowait: true
  }),

  // Batch versions of the HTTP methods, for use with the batch module
  batch_get: batchOp('GET'),
  batch_head: batchOp('HEAD'),
  batch_patch: batchOp('PATCH'),
  batch_post: batchOp('POST'),
  batch_put: batchOp('PUT'),
  batch_del: batchOp('DELETE'),
  batch_delete: batchOp('DELETE'),
  batch_noWaitPost: batchOp('POST', {
    nowait: true
  })
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
      return;
    }
    pings[t.uri].count = 0;
  };

  const t = target(undefined, uri, opt ? opt : cb, opt ? cb : undefined);

  // Warning: mutating variable pings
  pings[t.uri] = pings[t.uri] || {
      t: Date.now()
  };

  if(Date.now() - pings[t.uri].t >= 250) {
    // Warning: mutating variable pings
    pings[t.uri].t = Date.now();
    xrequest.options(t.uri, t.options, t.callback);
  }
  return pings[t.uri].count || 0;
};

// Ping the target URI every 250 msec and wait for it to become available
const waitFor = (uri, opt, cb) => {
  const t = target(undefined, uri, opt, cb);

  debug('Pinging %s', t.uri);
  const i = setInterval(() => {
    const n = xrequest.ping(t.uri, t.options);
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
module.exports = xrequest;
module.exports.route = route;
module.exports.ping = ping;
module.exports.waitFor = waitFor;

