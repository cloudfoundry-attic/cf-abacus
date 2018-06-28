'use strict';

// Plugin for an account management service.

// Mock the request module
const sandbox = sinon.sandbox.create();
const getStub = sandbox.stub();
require('abacus-request');
require.cache[require.resolve('abacus-request')].exports = {
  get: getStub
};

const backendResponse = require('./backend-test-response.json');

process.env.ACCOUNT_IGNORE_PATTERN = 'idz:';

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
    context('and backend responds OK', () => {
      before(() => {
        getStub.yields(undefined, { statusCode: 200, body: backendResponse });
      });

      it('returns correct account information', (done) => {
        const accounts = accountBackend('https://test-backend.com/accounts', () => 'test');
        const expectedResponse = backendResponse[0];
        accounts(expectedResponse.cfOrg, (err, val) => {
          expect(err).to.equal(undefined);
          expect(val).to.deep.equal({
            account_id: expectedResponse.id,
            organizations: [expectedResponse.cfOrg],
            pricing_country: 'USA',
            license_type: expectedResponse.licenseType
          });
          done();
        });
      });

      it('returns error if auth token is not provided', (done) => {
        const accounts = accountBackend('https://test-backend.com/accounts', undefined);
        accounts('anyOrg', (err, val) => {
          expect(err).to.not.equal(undefined);
          done();
        });
      });

      context('when no account info is available for an org', () => {
        it('returns sample account information', (done) => {
          const accounts = accountBackend('https://test-backend.com/accounts', () => 'test');
          accounts('testOrg', (err, val) => {
            expect(err).to.equal(undefined);
            expect(val).to.deep.equal(accountBackend.sampleAccount);
            done();
          });
        });
      });

      context('when org id matches ignore pattern', () => {
        it('returns sample account information', (done) => {
          const accounts = accountBackend('https://test-backend.com/accounts', () => 'test');
          accounts('idz:testOrg', (err, val) => {
            expect(err).to.equal(undefined);
            expect(val).to.deep.equal(accountBackend.sampleAccount);
            done();
          });
        });
      });
    });

    context('when the backend fails', () => {
      before(() => {
        getStub.yields(undefined, { statusCode: 422 });
      });

      it('returns error', (done) => {
        const accounts = accountBackend('https://test-backend.com/accounts', () => 'test');
        accounts('anyOrg', (err, val) => {
          expect(err).to.not.equal(undefined);
          done();
        });
      });
    });

  });
});
