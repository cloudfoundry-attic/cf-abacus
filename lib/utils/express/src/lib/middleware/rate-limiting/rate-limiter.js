

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

module.exports = (uri, window) => {
  let rateLimiter;
  let dbConnection;

  MongoClient.connect(uri, (err, db) => {
    if (err) {
      edebug('Cannot connect to MongoDb.', err);
      return;
    }
    const collection = db.collection(collectionName);
    dbConnection = db;
    rateLimiter = new RateLimit({
      windowMs: window.sizeMs,
      max: window.maxRequestsCount,
      store: new MongoStore(collection, window.sizeMs),
      delayMs: 0,
      skip: skipSystemRequests,
      keyGenerator: resourceProviderKeyGenerator
    });
  });

  const middleware = (req, res, next) => {
    if (!rateLimiter) {
      debug('Rate limiter is not connected to mongodb. Allowing all requests.');
      next();
    }
    rateLimiter(req, res, next);
  };

  const closeDbConnection = () => {
    if (!dbConnection) {
      debug('No active connection to MongoDb. Nothing to close.');
      return;
    }

    dbConnection.close();
  };

  return {
    middleware,
    closeDbConnection
  };
};
