'use strict';

// Plugin for an account management service.
const { extend } = require('underscore');
const request = require('abacus-request');
const oauth = require('abacus-oauth');
const backendResponse = require('./backend-test-response.json');

process.env.CLUSTER = false;
// Mock the oauth module with a spy
const oauthspy = spy((req, res, next) => next());
const oauthmock = extend({}, oauth, {
  validator: () => oauthspy
});
require.cache[require.resolve('abacus-oauth')].exports = oauthmock;

describe('abacus-account-plugin-itest', () => {
  let server;
  let accountPlugin, accountBackend;

  before(() => {
    oauthspy.reset();
  });

  context('when account backend is missing', () => {
    beforeEach(() => {
      process.env.SECURED = false;
      delete process.env.ACCOUNT_BACKEND;
      delete require.cache[require.resolve('..')];
      delete require.cache[require.resolve('../lib/account-backend')];
      accountBackend = require('../lib/account-backend');
      accountPlugin = require('..');
    });

    it('should return the sample account', (done) => {
      server = accountPlugin(0);
      request.get('http://localhost::p/v1/organizations/:org_id/account/:time', {
        p: server.address().port,
        org_id: 'abcd-1234',
        time: 1420070400000
      }, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val.statusCode).to.equal(200);
        expect(val.body).to.deep.equal(accountBackend.sampleAccount);
        done();
      });
    });
  });

  context('when account backend is available', () => {
    let responseStatusCode = 200;
    before(() => {
      // Mock the request module
      require.cache[require.resolve('abacus-request')].exports = {
        get: (url, opts, cb) => {
          cb(undefined, { statusCode: responseStatusCode, body: backendResponse });
        }
      };
      process.env.SECURED = false;
      process.env.ACCOUNT_TOKEN_URI = 'http://localhost:10000/test';
      process.env.ACCOUNT_BACKEND = 'dummy';
      delete require.cache[require.resolve('..')];
      delete require.cache[require.resolve('../lib/account-backend')];
      accountBackend = require('../lib/account-backend');
      accountPlugin = require('..');
    });

    context('and backend returns with no errors', () => {
      it('should return correct account information', (done) => {
        responseStatusCode = 200;
        server = accountPlugin(0);
        const expectedResponse = backendResponse[0];
        request.get('http://localhost::p/v1/organizations/:org_id/account/:time', {
          p: server.address().port,
          org_id: expectedResponse.cfOrg,
          time: 1420070400000
        }, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val.statusCode).to.equal(200);
          expect(val.body).to.deep.equal({
            account_id: expectedResponse.id,
            organizations: [ expectedResponse.cfOrg ],
            pricing_country: 'USA',
            license_type: expectedResponse.licenseType
          });
          done();
        });
      });
    });

    context('and backend returns an error', () => {
      it('should fail', (done) => {
        responseStatusCode = 500;
        server = accountPlugin(0);
        request.get('http://localhost::p/v1/organizations/:org_id/account/:time', {
          p: server.address().port,
          org_id: 'anyOrg',
          time: 1420070400000
        }, (err, val) => {
          expect(err).to.not.equal(undefined);
          done();
        });
      });
    });

  });




});
