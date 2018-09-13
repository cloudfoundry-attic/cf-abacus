'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const url = require('url');

const MongoClient = require('mongodb').MongoClient;

const rateLimitDefinition = {
  collectionName: 'test-rate-limit-collection',
  window: {
    sizeMs: 60 * 1000,
    maxRequestsCount: 2
  }
};

const tokenSecret = 'secret';
process.env.RATE_LIMIT = JSON.stringify(rateLimitDefinition);
process.env.SECURED = true;
process.env.JWTKEY = tokenSecret;
process.env.JWTALG = 'HS256';

const createToken = (scopes) => {
  const payload = {
    scope: scopes
  };
  return jwt.sign(payload, tokenSecret, {
    expiresIn:  2 * 60 * 60
  });
};

describe('abacus-express rate-limiting', () => {
  const testEndpoint = '/test';
  let app;

  before(function() {
    app = require('..')();
    app.get(testEndpoint, (req, res) => {
      res.send('Test endpoint');
    });
  });

  const makeRequestWithScope = (scope) => request(app)
    .get(testEndpoint)
    .set('Authorization', 'bearer ' + createToken([scope]));

  const clearDatabase = (done) => {
    const uri = process.env.DB_URI;
    const dbName = (url.parse(uri).pathname || '/db').substring(1);

    MongoClient.connect(uri, { useNewUrlParser: true }, (err, client) => {
      const db = client.db(dbName);
      db.dropCollection(rateLimitDefinition.collectionName, () => client.close(done));
    });
  };

  beforeEach((done) => {
    clearDatabase(done);
  });

  context('when multiple resource providers make requests', () => {

    const itLimitsIndependently = (operation) =>
      it('each of them is limited independently', (done) => {
        const makeRequestByResourceProvider = (resourceProvider) =>
          makeRequestWithScope(`abacus.usage.${resourceProvider}.${operation}`);

        async.series([
          (callback) => makeRequestByResourceProvider('first').expect(httpStatus.OK, callback),
          (callback) => makeRequestByResourceProvider('first').expect(httpStatus.OK, callback),
          (callback) => makeRequestByResourceProvider('second').expect(httpStatus.OK, callback),
          (callback) => makeRequestByResourceProvider('first').expect(httpStatus.TOO_MANY_REQUESTS, callback),
          (callback) => makeRequestByResourceProvider('second').expect(httpStatus.OK, callback),
          (callback) => makeRequestByResourceProvider('second').expect(httpStatus.TOO_MANY_REQUESTS, callback)
        ], done);
      });

    context('when read oauth scope is used', () => {
      itLimitsIndependently('read');
    });

    context('when write oauth scope is used', () => {
      itLimitsIndependently('write');
    });

  });

  context('when system requests are made', () => {

    const itAllowsUnlimitedSystem = (operation) =>
      it('they are not limited', (done) => {
        const makeSystemRequest = () => makeRequestWithScope(`abacus.usage.${operation}`);

        async.series([
          (callback) => makeSystemRequest().expect(httpStatus.OK, callback),
          (callback) => makeSystemRequest().expect(httpStatus.OK, callback),
          (callback) => makeSystemRequest().expect(httpStatus.OK, callback)
        ], done);
      });


    context('when read oauth scope is used', () => {
      itAllowsUnlimitedSystem('read');
    });

    context('when write oauth scope is used', () => {
      itAllowsUnlimitedSystem('write');
    });

  });
});
