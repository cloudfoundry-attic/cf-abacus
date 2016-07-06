'use strict';

// Simple wrapper around the popular Node request module, adding some logging
// and Express-like route URI templates

const _ = require('underscore');
const rrequest = require('request');
const transform = require('abacus-transform');
const url = require('url');
const lock = require('abacus-lock');
const lru = require('abacus-lrucache');

const extend = _.extend;
const map = _.map;
const groupBy = _.groupBy;
const pick = _.pick;
const flatten = _.flatten;
const sortBy = _.sortBy;
const filter = _.filter;
const find = _.find;
const omit = _.omit;

/* jshint undef: false */
/* jshint unused: false */

// Setup debug log
const debug = require('abacus-debug')('abacus-request');
const edebug = require('abacus-debug')('e-abacus-request');

// Return the list of parameters found in a URI template
const params = (template) => {
  return map(template.match(/:[a-z_][a-z0-9_]*/ig), (k) => k.substr(1));
};

// Generates a URI from an Express-like URI template, use like this:
// request.route('http://.../:x/:y', { x: 1, y: 2 });
// returns http://.../1/2
const route = (template, parms) => {
  return template.replace(/:[a-z_][a-z0-9_]*/ig, (name) => {
    const k = name.substr(1);
    return parms[k] === undefined ? name : parms[k];
  });
};

// Setup request default options
const drequest = rrequest.defaults({
  json: true,
  rejectUnauthorized: false,
  forever: true,
  pool: {
    maxSockets: 100
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
      return extend({}, opt, { route: uri });

    if(typeof uri === 'string')
      return { route: uri };

    return extend({}, uri, { route: uri.route || uri.uri });
  };

  // Resolve the route URI
  const resolve = (opts) => extend({}, opts, {
    uri: route(opts.route, opts)
  });

  // Determine the target method
  const method = (m, opts) => extend({}, opts, m ? {
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

// Return true if the given request target is cacheable
const cacheableTarget = (t) => {
  if (!t.options.cache || !t.callback ||
    t.options.method !== undefined && t.options.method !== 'GET')
    return false;
  return true;
};

// Return true if the given request target and response are cacheable
const cacheable = (t, res) => {
  if (!cacheableTarget(t))
    return false;
  if(res && res.statusCode !== undefined && res.statusCode !== 200)
    return false;
  return res ? true : false;
};

// Maintain a LRU cache of REST resources
const resources = lru({
  max: 1000,
  maxAge: 1000 * 60 * 20
});

// Cache a response
const cache = (uri, res) => {
  resources.set(uri, pick(res,
    'statusCode', 'cookies', 'headers', 'body'));
  debug('Cached %s resource %d %o',
    uri, res.statusCode || 200, res.body ? res.body : '');
  return res;
};

// Return a resource from the cache
const cached = (uri) => {
  const res = resources.get(uri);
  if(!res)
    debug('Didn\'t find resource %s in cache', uri);
  else
    debug('Found resource %s in cache %d %o',
      uri, res.statusCode || 200, res.body ? res.body : '');
  return res;
};

// Convert an HTTP result with an error status code to an exception
const httpexc = (res) => {
  const exc = new Error(
      // Look for an error message in the body
      res.body && res.body.message ? res.body.message :
      res.body && res.body.error ? res.body.error :
    'HTTP response status code ' + res.statusCode);

  // Warning: mutating variable err as that's really the simplest
  // way to set its code property without having to get into the
  // mess of creating a subclass of Error
  exc.code = res.statusCode;
  exc.statusCode = res.statusCode;
  return exc;
};

// Simple wrapper around the request module function, use like this:
// request('http://localhost/whatever/:x/:y', { x: 10, y: 20 }, (err, res) => {
//   do something with res, res is a Javascript object parsed from the
//   JSON response
// });
const request = (uri, opts, cb) => {
  // Convert the input parameters to a request target configuration
  const t = target(undefined, uri, opts, cb);

  // Send the request
  const send = (t, scb) => {
    debug('Sending %s request %s %o',
      t.options.method, t.uri, t.options.body || '');

    return drequest(t.options, scb ? (err, res) => {
      // Call back with the response
      if(err) {
        edebug('Request error %o', err);
        debug('Request error %o', err);
        return scb(err, undefined);
      }

      debug('Received %s response %d %o',
        t.options.method, res.statusCode, res.body || '');

      if(res.statusCode >= 500 && res.statusCode <= 599)
        return scb(httpexc(res), undefined);

      // Optionally cache REST resources
      if(cacheable(t, res))
        cache(t.uri, res);

      return scb(undefined, res);
    } : undefined);
  };

  // Optionally look for a cached REST resource
  if(cacheableTarget(t))
    return lock(t.uri, (err, unlock) => {
      if(err) {
        t.callback(err);
        unlock();
        return;
      }
      const res = cached(t.uri);
      if(res) {
        t.callback(undefined, res);
        unlock();
        return;
      }

      // Send the request
      send(t, (err, res) => {
        t.callback(err, res);
        unlock();
      });
    });

  // If not cacheable then just sent the request
  return send(t, t.callback);
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
    const targets = map(reqs, (args, i, reqs) => {
      const cbargs = args.concat(() => undefined);
      return {
        i: i,
        target: target(m, cbargs[0], cbargs[1], cbargs[2])
      };
    });

    // Optionally lookup cached REST resources
    transform.map(targets, (t, i, targets, ccb) => {
      if(cacheableTarget(t.target)) {
        const res = cached(t.target.uri);
        if(res)
          return ccb(undefined,
            extend({}, t, { cached: [undefined, res] }));
      }
      return ccb(undefined, t);

    }, (err, res) => {
      if(err) cb(err);

      // Collect the cached resources
      const rcached = map(
        filter(res, (t) => t.cached), (r) => ({ i: r.i, res: r.cached }));

      // Collect the non-cached resources
      const targets = filter(res, (t) => !t.cached);

      // Send the remaining requests, group the calls by target
      // protocol, auth, host and OAuth bearer access token
      const groups = map(groupBy(targets, (t) => 
        [url.resolve(t.target.uri, '/'),
          t.target.options.headers && t.target.options.headers.authorization ?
          t.target.options.headers.authorization : ''].join('-')));

      // Send a single HTTP request per group
      transform.map(groups, (group, g, groups, gcb) => {
        // Build the request body
        const greq = map(group,
          (t) => extend({ uri: url.parse(t.target.uri).path },
            pick(t.target.options, 'method', 'headers', 'json', 'body')));

        // Use the group's OAuth bearer access token for POST request
        const o = greq[0].headers && greq[0].headers.authorization ? {
          headers:  pick(greq[0].headers, 'authorization')
        } : {};

        // Send the POST request to the target's host /batch path
        post(url.resolve(group[0].target.uri, '/batch'), extend(o,
          { body: greq }), (err, bres) => {
            if(err) {
              gcb(undefined, map(group, (g) => {
                return { i: g.i, res: [err, undefined] };
              }));
              return;
            }

            // Return the list of results from the response body
            if(bres) {
              // Forward non-200 status codes from /batch to requests
              const httpres = () => {
                edebug('Received batch response %d %o %o', bres.statusCode,
                  pick(bres.headers, 'www-authenticate') || '',
                  bres.body || '');
                debug('Received batch response %d %o %o', bres.statusCode,
                  pick(bres.headers, 'www-authenticate') || '',
                  bres.body || '');

                gcb(undefined, map(group, (g) => ({
                  i: g.i,
                  res: [undefined, extend({}, bres)]
                })));
              };

              // Handle non-200 status codes from /batch
              if (bres.statusCode !== 200) {
                httpres();
                return;
              }

              gcb(undefined, map(bres.body, (r, i) => {
                if(r.statusCode >= 500 && r.statusCode <= 599)
                  return { i: group[i].i, res: [httpexc(r), undefined] };

                return { i: group[i].i, res: [undefined, {
                  statusCode: r.statusCode || 200,
                  headers: extend(r.headers || omit(bres.headers,
                   [ 'content-type', 'content-length' ]) || {},
                   r.header && r.header.Location ?
                   { location: r.header.Location } : {}),
                  body: r.body
                }] };
              }));
            }
            else
              gcb(undefined, map(group, (g) => {
                return { i: g.i, res: [undefined, undefined] };
              }));
          });
      }, (err, gres) => {
        if(err) {
          cb(err);
          return;
        }

        // Optionally cache GET responses
        const fgres = flatten(gres, true);
        transform.map(fgres, (r, i, fgres, rcb) => {
          const t = find(targets, (t) => t.i === r.i);

          if(cacheable(t.target, r.res[1]))
            cache(t.target.uri, r.res[1]);

          return rcb();
        }, () => {
          // Return assembled list of results from the cached list and
          // the list of groups, sorted like the corresponding requests
          const res = map(sortBy(rcached.concat(fgres), (r) => r.i),
            (r) => r.res);

          cb(undefined, res);
        });
      });
    });
  };
};

// Shorthand functions for the various HTTP methods
extend(request, {
  get: singleOp('GET'),
  head: singleOp('HEAD'),
  patch: singleOp('PATCH'),
  options: singleOp('OPTIONS'),
  post: singleOp('POST'),
  put: singleOp('PUT'),
  del: singleOp('DELETE'),
  delete: singleOp('DELETE'),

  // Batch versions of the HTTP methods, for use with the batch module
  batch_get: batchOp('GET'),
  batch_head: batchOp('HEAD'),
  batch_patch: batchOp('PATCH'),
  batch_post: batchOp('POST'),
  batch_put: batchOp('PUT'),
  batch_del: batchOp('DELETE'),
  batch_delete: batchOp('DELETE')
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
  pings[t.uri] = pings[t.uri] || { t: Date.now() };

  if(Date.now() - pings[t.uri].t >= 250) {
    // Warning: mutating variable pings
    pings[t.uri].t = Date.now();
    request.options(t.uri, t.options, t.callback);
  }

  return pings[t.uri].count || 0;
};

// Ping the target URI every 250 msec and wait for it to become available
const waitFor = (uri, opt, time, cb) => {
  const callback = typeof time === 'function' && !cb ? time : cb;
  const timeout = typeof time === 'function' ? 10000 : time;

  const t = target(undefined, uri, opt, callback);

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

  // Time out (by default after 10 seconds)
  const to = setTimeout(() => {
    debug('Timed out after %d ms', timeout);
    clearInterval(i);
    t.callback(new Error('timeout'));
  }, timeout);
};

// Export our public functions
module.exports = request;
module.exports.params = params;
module.exports.route = route;
module.exports.ping = ping;
module.exports.waitFor = waitFor;

