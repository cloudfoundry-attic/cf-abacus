'use strict';

// Small Express router that runs request handlers written as ES6 generators
// using Node co. On top of that the router supports batching

const { allKeys, each, extend, map, omit, pick, toArray, without } = require('underscore');

const express = require('express');
const url = require('url');
const yieldable = require('abacus-yieldable');
const transform = require('abacus-transform');

// Setup debug log
const debug = require('abacus-debug')('abacus-router');
const edebug = require('abacus-debug')('e-abacus-router');

// https://medium.com/@Abazhenov/using-async-await-in-express-with-node-8-b8af872c0016
const asyncMiddleware = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).then((value) => next(undefined, value)).catch(next);

// Convert a middleware function which can be a regular Express middleware or a
// generator to a regular Express middleware function.
const callbackify = (m, trusted) => {
  const mfunc = yieldable.isAsyncFunction(m) ? asyncMiddleware(m) : yieldable.functioncb(m);

  // Return a middleware function. Middleware functions can be of the form
  // function(req, res, next) or function(err, req, res, next)
  return function() {
    const next = arguments[arguments.length - 1];
    const res = arguments[1];
    const params = toArray(arguments).slice(0, arguments.length - 1);

    // Pass errors down the middleware stack
    const error = (err, type) => {
      edebug('Route error - %s - %o', type, err);
      debug('Route error - %s - %o', type, err);
      next(err);
    };

    // Call the middleware function
    try {
      mfunc.apply(
        undefined,
        params.concat([
          (err, value) => {
            if (err) error(err, 'generator error');
            else if (value)
              // Store the returned value in the response, it'll be sent
              // by one of our Express middleware later down the
              // middleware stack
              res.value = value;
            next();
          }
        ])
      );
    } catch (exc) {
      error(exc, 'exception');
    }
  };
};

// Return an implementation of the router.use(path, middleware) function that
// supports middleware implemented as generators in addition to regular
// callbacks
const use = (original, trusted) => {
  return function(path, m) {
    return typeof path === 'function'
      ? original.call(this, callbackify(path, trusted))
      : original.call(this, path, callbackify(m, trusted));
  };
};

// Return an implementation of the router.route() function that supports
// middleware implemented as generators in addition to regular callbacks
const route = (original, trusted) => {
  return function() {
    // Get the route
    const r = original.apply(this, arguments);

    // Monkey patch its HTTP methods
    each(['get', 'head', 'post', 'put', 'patch', 'delete', 'options', 'all', 'use'], (method) => {
      const f = r[method];
      r[method] = function() {
        const middleware = map(toArray(arguments), function(m) {
          return callbackify(m, trusted);
        });
        return f.apply(this, middleware);
      };
    });
    return r;
  };
};

// Return an Express router middleware that works with generators
const router = (trusted) => {
  const r = express.Router();

  // Monkey patch the router function with our implementation of the use
  // and route functions
  r.use = use(r.use, trusted);
  r.route = route(r.route, trusted);

  return r;
};

// Return an express middleware that runs a batch of requests through the
// given router
const batch = (routes) => {
  return (req, res, next) => {
    if (req.method !== 'POST' || req.url !== '/batch') {
      next();
      return;
    }
    debug('Handling batch request %o', req.body);

    // Run the batch of requests found in the body through the router
    transform.map(
      req.body,
      (r, i, reqs, rcb) => {
        // Setup an Express request representing the batched request
        const path = url.resolve(req.url, r.uri);
        const rreq = extend({}, pick(req, without(allKeys(req), 'host')), {
          method: r.method,
          url: path,
          path: path,
          body: r.body
        });

        // Setup an Express response object that will capture the response
        const rres = extend({}, res, {
          status: (s) => {
            debug('Batched request setting status %s', s);
            rres.statusCode = s;
            return rres;
          },
          header: (k, v) => {
            if (!rres.header) rres.header = {};
            debug('Batched request setting header %s to %s', k, v);
            rres.header[k] = v;
            return rres;
          },
          send: (b) => {
            debug('Batched request sending body %o', b);
            rres.body = b;
            return rres.end();
          },
          json: (b) => {
            debug('Batched request sending JSON body %o', b);
            rres.body = b;
            return rres.end();
          },
          end: () => {
            debug('Batched request ending');
            rcb(undefined, {
              statusCode: rres.statusCode,
              header: omit(rres.header, 'setHeader'),
              body: rres.body
            });
            return rres;
          }
        });

        // Call the given router
        debug('Handling batched request %o', r);
        routes(rreq, rres, (err) => {
          if (err) {
            debug('Batched request calling back with error %o', err);
            rcb(err);
            return;
          }

          if (rres.value) {
            debug('Batched request calling back with value %o', rres.value);
            rcb(undefined, rres.value);
          }
        });
      },
      (err, bres) => {
        if (err) {
          debug('Batch request returning 500 error %o', err);
          res.status(500).end();
          return;
        }

        // Return the batch of results
        debug('Batch request sending results %o', bres);
        res.send(bres);
      }
    );
  };
};

// Export our public functions
module.exports = router;
module.exports.batch = batch;
