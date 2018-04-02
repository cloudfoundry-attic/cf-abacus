'use strict';

const async = require('async');
const httpStatus = require('http-status-codes');
const MongoClient = require('mongodb').MongoClient;
const jwt = require('jsonwebtoken');
const request = require('supertest');

const rateLimitDefinition = {
  dbalias: 'db',
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

const app = require('..')();

const createToken = (scopes) => {
  const payload = {
    scope: scopes
  };
  return jwt.sign(payload, tokenSecret, {
    expiresIn:  2 * 60 * 60
  });
};

describe('abacus-express rate-limiting', () => {
  const collectionName = 'rate-limit-data';
  const testEndpoint = '/test';

  before(function() {
    if (!process.env.DBCLIENT || process.env.DBCLIENT !== 'abacus-mongoclient') {
      console.log('Skipping rate limiting tests as DBCLIENT is not set to Mongo. ');
      this.skip();
    }

    app.get(testEndpoint, (req, res) => {
      res.send('Test endpoint');
    });
  });

  const clearDatabase = (done) => {
    MongoClient.connect(process.env.DB, (err, db) => {
      db.dropCollection(collectionName, () => db.close(done));
    });
  };

  beforeEach((done) => {
    clearDatabase(done);
  });

  context('when multiple resource providers make requests', () => {

    const itIndepenentLimiting = (operation) =>
      it('each of them is limited independently', (done) => {
        const makeRequestByResourceProvider = (resourseProvider) => request(app)
          .get(testEndpoint)
          .set('Authorization', 'bearer ' + createToken([`abacus.usage.${resourseProvider}.${operation}`]));

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
        const makeSystemRequest = () => request(app)
          .get(testEndpoint)
          .set('Authorization', 'bearer ' + createToken([`abacus.usage.${operation}`]));

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
