'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');
const MongoClient = require('mongodb').MongoClient;
const jwt = require('jsonwebtoken');
const request = require('supertest');

const rateLimitDefinition = {
  dbalias: 'db',
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

const isTestRunOnMongoDb = () => process.env.DBCLIENT && process.env.DBCLIENT == 'abacus-mongoclient';

// As current request rate limit implementation lays on MongoDb, these tests are inadequate when run on different db.
if (isTestRunOnMongoDb())
  describe('abacus-express rate-limiting', () => {
    const testEndpoint = '/test';
    let app;

    before(function() {
      if (!process.env.DBCLIENT || process.env.DBCLIENT !== 'abacus-mongoclient') {
        console.log('Skipping rate limiting tests as DBCLIENT is not set to Mongo. ');
        this.skip();
      }

      app = require('..')();
      app.get(testEndpoint, (req, res) => {
        res.send('Test endpoint');
      });
    });

    const makeRequestWithScope = (scope) =>request(app)
      .get(testEndpoint)
      .set('Authorization', 'bearer ' + createToken([scope]));

    const clearDatabase = (done) => {
      MongoClient.connect(process.env.DB, (err, db) => {
        db.dropCollection(rateLimitDefinition.collectionName, () => db.close(done));
      });
    };

    beforeEach((done) => {
      clearDatabase(done);
    });

    context('when multiple resource providers make requests', () => {

      const itIndepenentLimiting = (operation) =>
        it('each of them is limited independently', (done) => {
          const makeRequestByResourceProvider = (resourseProvider) =>
            makeRequestWithScope(`abacus.usage.${resourseProvider}.${operation}`);

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
        itIndepenentLimiting('read');
      });

      context('when write oauth scope is used', () => {
        itIndepenentLimiting('write');
      });

    });

    context('when system requests are made', () => {

      const itSystemUnlimited = (operation) =>
        it('they are not limited', (done) => {
          const makeSystemRequest = () => makeRequestWithScope(`abacus.usage.${operation}`);

          async.series([
            (callback) => makeSystemRequest().expect(httpStatus.OK, callback),
            (callback) => makeSystemRequest().expect(httpStatus.OK, callback),
            (callback) => makeSystemRequest().expect(httpStatus.OK, callback)
          ], done);
        });


      context('when read oauth scope is used', () => {
        itSystemUnlimited('read');
      });

      context('when write oauth scope is used', () => {
        itSystemUnlimited('write');
      });

    });

  });
