'use strict';

const url = require('url');

const MongoClient = require('mongodb').MongoClient;
const RateLimit = require('express-rate-limit');
const MongoStore = require('./mongo-store');

const urienv = require('abacus-urienv');
const debug = require('abacus-debug')('abacus-express-rate-limit');

const resourceProviderKeyGenerator = (req) =>
  req.context.oauth.scopes.readResourceScopes[0]
  || req.context.oauth.scopes.writeResourceScopes[0];

const skipSystemRequests = (req) => {
  if (!req.context || !req.context.oauth || !req.context.oauth.scopes)
    return true;

  const scopes = req.context.oauth.scopes;
  return scopes.hasSystemReadScope || scopes.hasSystemWriteScope;
};

const getDbUri = (dbalias) => {
  const uris = urienv({
    [dbalias]: 5984
  });
  const dburis = uris[dbalias];
  if (Array.isArray(dburis))
    return dburis[0];

  return dburis;
};

/* eslint-disable complexity */
const validateRateLimitDefinition = (rateLimitDefinition) => {
  if (!rateLimitDefinition
    || !rateLimitDefinition.dbalias
    || !rateLimitDefinition.collectionName
    || !rateLimitDefinition.window
    || !rateLimitDefinition.window.sizeMs
    || !rateLimitDefinition.window.maxRequestsCount)
    throw new Error('Invalid rate limit definition: ' + rateLimitDefinition);
};


/**
 * Creates a MongoDb backed middleware for requests rate limiting.
 * Before the connection is established rate limiting is not performed and all incoming requests are let in.
 * In case the connection fails, an error would be thrown.
 *
 * Note: The middleware will let in all incoming system requests (those with system oauth scope).
 *
 * @requires oauth-context middlware - as rate-limiter middleware uses an information that is expected
 * to be put by oauth-context middlware, oauth-context middleware must be register before rate-limiter one.
 *
 * @param {Object} rateLimitDefinition should contain:
 *  dbalias - binded service instance name
 *  collectionName - The name of MongoDb collection where rating data will be stored
 *  window.sizeMs - the limit window size in milliseconds
 *  window.maxRequestsCount - the maximum number of allowed requests per resource provider within the window
 *
 *
 * @returns express middleware function.
 *    The result cotains 'close' function that closes the underlying MongoDb connection.
 *
 * @example
 * createRateLimit({
 *  dbalias: 'db',
 *  collectionName: 'test',
 *  window: {
 *    sizeMs: 1000,
 *    maxRequestsCount: 10
 *  }
 * });
 */
module.exports = (rateLimitDefinition) => {
  validateRateLimitDefinition(rateLimitDefinition);

  let rateLimiter;
  let dbConnection;

  const uri = getDbUri(rateLimitDefinition.dbalias);
  debug('Connecting to MongoDB on uri: %s', uri);
  MongoClient.connect(uri, { useNewUrlParser: true }, (err, client) => {
    if (err)
      throw new Error(`Cannot connect to MongoDB. Url: ${uri}, error: ${err}`);

    const dbName = (url.parse(uri).pathname || '/db').substring(1);
    const db = client.db(dbName);

    const collection = db.collection(rateLimitDefinition.collectionName);

    rateLimiter = new RateLimit({
      windowMs: rateLimitDefinition.window.sizeMs,
      max: rateLimitDefinition.window.maxRequestsCount,
      store: new MongoStore(collection, rateLimitDefinition.window.sizeMs),
      delayMs: 0,
      skip: skipSystemRequests,
      keyGenerator: resourceProviderKeyGenerator
    });

    dbConnection = client;
  });

  const middleware = (req, res, next) => {
    if (!rateLimiter) {
      debug('Rate limiter is not connected to MongoDB, yet. Allowing all connections.');
      next();
      return;
    }

    rateLimiter(req, res, next);
  };

  const closeDbConnection = () => {
    if (!dbConnection) {
      debug('No active connection to MongoDB. Nothing to close');
      return;
    }

    dbConnection.close();
  };

  middleware.close = closeDbConnection;
  return middleware;
};
