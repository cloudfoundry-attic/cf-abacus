'use strict';

const requestMock = require('./request-mock.js');
const accountClient = require('../index.js');
const urienv = require('abacus-urienv');

const { extend } = require('underscore');

/* eslint no-unused-expressions: 1 */

describe('account client tests', () => {
  const uris = urienv({
    account: 9881
  });

  let usage = {
    start: 1420243200000,
    end: 1420245000000,
    organization_id: 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27',
    space_id: 'aaeae239-f3f8-483c-9dd0-de5d41c38b6a',
    consumer_id: 'external:bbeae239-f3f8-483c-9dd0-de6781c38bab',
    resource_id: 'test-resource',
    plan_id: 'basic',
    resource_instance_id: '0b39fa70-a65f-4183-bae8-385633ca5c87',
    measured_usage: [
      {
        measure: 'light_api_calls',
        quantity: 12
      }
    ]
  };

  const accountUri = `${uris.account}/v1/organizations/:org_id/account/:time`;
  const expectedAccount = { account_id: 'account_id', pricing_country: 'pricing_country' };

  describe('#getAccount', () => {
    context('when requested', () => {
      it('should return the account', async() => {
        requestMock.setSpy(accountUri, { statusCode: 200, body: expectedAccount });

        const account = await accountClient.getAccount(usage, undefined);
        expect(account).to.deep.equal(expectedAccount);
      });
    });

    context('with account is not found', () => {
      const errorMessage = 'error message';

      it('should throw specific error', async() => {
        usage.organization_id = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28';
        requestMock.setSpy(accountUri, { statusCode: 404, body: { error: errorMessage } });

        await expect(accountClient.getAccount(usage, undefined))
          .to.be.eventually.rejectedWith(Error, errorMessage)
          .and.have.property('accountNotFound', true);
      });
    });

    context('when account service is down', () => {
      it('should throw an error', async() => {
        usage.organization_id = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28';
        requestMock.setSpy(accountUri, { statusCode: 404, body: { } });

        await expect(accountClient.getAccount(usage, undefined))
          .to.be.eventually.rejectedWith(Error, 'Account service not available')
          .and.not.have.property('accountNotFound');
      });
    });

    context('when an arbitrary communication error occurs', () => {
      it('should throw an error and propagete the status code', async() => {
        usage.organization_id = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28';
        requestMock.setSpy(accountUri, { statusCode: 502 });

        await expect(accountClient.getAccount(usage, undefined))
          .to.be.eventually.rejectedWith(Error, 'Error while communicating with Account service. Response code: 502')
          .and.not.have.property('accountNotFound');
      });
    });
  });

  describe('#validateAccount', () => {

    context('when account license type is unsupported', () => {
      it('validation should fail', async() => {
        const unsupportedType = 'unsupported';

        const unsupportedAccount = extend({}, expectedAccount, { license_type: unsupportedType });
        usage.organization_id = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28';
        requestMock.setSpy(accountUri, { statusCode: 200, body: unsupportedAccount });

        await expect(accountClient.validateAccount(usage, undefined, [unsupportedType]))
          .to.be.eventually.rejectedWith(Error)
          .and.have.property('unsupportedLicense', unsupportedType);
      });
    });

    context('when account license type is supported', () => {
      it('validation should pass ', async() => {
        const licenseType = 'supported-license-type';

        const account = extend({}, expectedAccount, { license_type: licenseType });
        usage.organization_id = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28';
        requestMock.setSpy(accountUri, { statusCode: 200, body: account });

        await accountClient.validateAccount(usage, undefined, []);
      });
    });

  });

});
