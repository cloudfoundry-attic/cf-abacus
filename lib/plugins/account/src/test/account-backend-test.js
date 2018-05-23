'use strict';

// Plugin for an account management service.

// Mock the request module
require('abacus-request');
const backendResponse = require('./backend-test-response.json');
require.cache[require.resolve('abacus-request')].exports = {
  get: (url, opts, cb) => {
    cb(undefined, { statusCode: responseStatusCode, body: backendResponse });
  }
};

let responseStatusCode = 200;
const accountBackend = require('../lib/account-backend');

describe('abacus-account-plugin-backend', () => {

  context('when backend URI is not provided', () => {
    it('returns default/sample account information', (done) => {
      const accounts = accountBackend(undefined, () => 'test');
      accounts('testOrg', (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal(accountBackend.sampleAccount);
        done();
      });
    });
  });

  context('when backend URI is available', () => {
    it('returns correct account information', (done) => {
      responseStatusCode = 200;
      const accounts = accountBackend('https://test-backend.com/accounts', () => 'test');
      const expectedResponse = backendResponse[0];
      accounts(expectedResponse.cfOrg, (err, val) => {
        expect(err).to.equal(undefined);
        expect(val).to.deep.equal({
          account_id: expectedResponse.id,
          organizations: [ expectedResponse.cfOrg ],
          pricing_country: 'USA',
          license_type: expectedResponse.licenseType
        });
        done();
      });
    });

    it('returns error if auth token is not provided', (done) => {
      responseStatusCode = 200;
      const accounts = accountBackend('https://test-backend.com/accounts', undefined);
      accounts('anyOrg', (err, val) => {
        expect(err).to.not.equal(undefined);
        done();
      });
    });

    it('returns error when the backend call fails', (done) => {
      const accounts = accountBackend('https://test-backend.com/accounts', () => 'test');
      responseStatusCode = 500;
      accounts('anyOrg', (err, val) => {
        expect(err).to.not.equal(undefined);
        done();
      });
    });
  });


});
