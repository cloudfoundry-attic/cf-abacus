'use strict';

const _ = require('underscore');
const extend = _.extend;

// Mock the cluster module
const cluster = require('abacus-cluster');
require.cache[require.resolve('abacus-cluster')].exports =
  extend((app) => app, cluster);

const request = require('abacus-request');
const httpStatus = require('http-status-codes');

describe('Catalog', () => {
  let server;
  let broker;

  const secured = process.env.SECURED;

  const deleteModules = () => {
    delete require.cache[require.resolve('../catalog/catalog.js')];
    delete require.cache[require.resolve('..')];
    delete require.cache[require.resolve('../routes/get-catalog.js')];
  };

  const authHeader = (user, password) => ({
    authorization: 'Basic ' +
    new Buffer(user + ':' + password).toString('base64')
  });

  afterEach(() => {
    if (server)
      server.close();

    process.env.SECURED = secured;
  });

  beforeEach(() => {
    deleteModules();

    broker = require('..');
    const app = broker();
    server = app.listen(0);
  });

  context('with correct credentials', () => {
    const user = 'borked';
    const password = 'secretly';

    before(() => {
      process.env.BROKER_USER = user;
      process.env.BROKER_PASSWORD = password;
    });

    it('returns catalog', (done) => {
      request.get('http://localhost::p/v2/catalog', {
        p: server.address().port,
        headers: authHeader(user, password)
      }, (err, response) => {
        expect(err).to.equal(undefined);
        expect(response.statusCode).to.equal(200);
        expect(response.headers).to.include.keys('content-type');
        expect(response.headers['content-type']).to.contain('application/json');
        expect(response.body).to.deep.equal(require('../catalog/catalog.js'));

        done();
      });
    });

    it('returns catalog with proper dashboard details', (done) => {
      request.get('http://localhost::p/v2/catalog', {
        p: server.address().port,
        headers: authHeader(user, password)
      }, (err, response) => {
        expect(err).to.equal(undefined);
        expect(response.statusCode).to.equal(200);
        expect(response.headers).to.include.keys('content-type');
        expect(response.headers['content-type']).to.contain('application/json');
        expect(response.body).to.include.keys('services');
        done();
      });
    });

    context('with prefix', () => {
      before(() => {
        deleteModules();
        process.env.ABACUS_PREFIX = 'test-';
      });

      it('returns catalog with prefixed ids', (done) => {
        request.get('http://localhost::p/v2/catalog', {
          p: server.address().port,
          headers: authHeader(user, password)
        }, (err, response) => {
          expect(err).to.equal(undefined);
          expect(response.statusCode).to.equal(200);
          expect(response.headers).to.include.keys('content-type');
          expect(response.headers['content-type'])
            .to.contain('application/json');
          expect(response.body.services[0].id)
            .to.include(process.env.ABACUS_PREFIX);
          expect(response.body.services[0].name)
            .to.include(process.env.ABACUS_PREFIX);
          expect(response.body.services[0].plans[0].id)
            .to.include(process.env.ABACUS_PREFIX);

          done();
        });
      });
    });
  });

  context('with incorrect credentials', () => {
    const user = 'someone';
    const password = 'withwrongpassword';

    before(() => {
      process.env.BROKER_USER = 'user';
      process.env.BROKER_PASSWORD = 'password';
    });

    it('fails with proper error', (done) => {
      request.get('http://localhost::p/v2/catalog', {
        p: server.address().port,
        headers: authHeader(user, password)
      }, (err, response) => {
        expect(err).to.equal(undefined);
        expect(response.statusCode).to.equal(401);
        expect(response.body).to.equal(
          httpStatus.getStatusText(httpStatus.UNAUTHORIZED)
        );

        done();
      });
    });
  });
});
