

'use strict';

const MongoClient = require('mongodb').MongoClient;
const RateLimit = require('express-rate-limit');
const MongoStore = require('./mongo-store');

const debug = require('abacus-debug')('abacus-express-rate-limit');
const edebug = require('abacus-debug')('e-abacus-express-rate-limit');

const collectionName = 'rate-limit-data';

const resourceProviderKeyGenerator = (req) =>
  req.context.oauth.scopes.readResourceScopes[0]
  || req.context.oauth.scopes.writeResourceScopes[0];

const skipSystemRequests = (req) => {
  if (!req.context || !req.context.oauth || !req.context.oauth.scopes)
    return true;

  const scopes = req.context.oauth.scopes;
  return scopes.hasSystemReadScope || scopes.hasSystemWriteScope;
};

/**
 * Creates a MongoDb backed middleware for requests rate limiting.
 * Before the connection is established all incoming requests are allowed.
 * In case the connection fails all requests would be allowed, as well.
 *
 * @requires oauth-context middlware - as rate-limiter middleware uses an information that is expected
 * to be put by oauth-context middlware, oauth-context middleware must be register before rate-limiter one.
 *
 * @param {string} uri - MongoDb server uri.
 * @param {object} window - should contain sizeMs and maxRequestsCount properties,
 *    defining the limit window size in milliseconds and the maximum number of allowed requests per resource provider
 *    within the window respectivly.
 *
 * @returns express middleware function.
 *    The result cotains 'close' function that closes the underlying MongoDb connection.
 */
module.exports = (uri, window) => {
  let rateLimiter;
  let dbConnection;

  MongoClient.connect(uri, (err, db) => {
    if (err) {
      edebug('Cannot connect to MongoDb. Url: %s, error: ', uri, err);
      cb(err);
      return;
    }
    const collection = db.collection(collectionName);

    rateLimiter = new RateLimit({
      windowMs: window.sizeMs,
      max: window.maxRequestsCount,
      store: new MongoStore(collection, window.sizeMs),
      delayMs: 0,
      skip: skipSystemRequests,
      keyGenerator: resourceProviderKeyGenerator
    });

    dbConnection = db;
  });

  const middleware = (req, res, next) => {
    if (!rateLimiter) {
      debug('Rate limiter is not connected to MongoDb, yet. Allowing all connections.');
      next();
      return;
    }

    rateLimiter(req, res, next);
  };

  const closeDbConnection = () => {
    if (!dbConnection) {
      debug('No active connection to MongoDb. Nothing to close');
      return;
    }

    dbConnection.close();
  };

  middleware.close = closeDbConnection;
  return middleware;
};
