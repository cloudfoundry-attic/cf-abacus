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
  });


  describe('#validateAccount', () => {
    context('with invalid account', () => {
      const errorMessage = 'error message';

      it('should throw with valid error', async() => {
        usage.organization_id = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28';
        requestMock.setSpy(accountUri, { statusCode: 404, body: { error: errorMessage } });

        await expect(accountClient.validateAccount(usage, undefined))
          .to.be.eventually.rejectedWith(Error, errorMessage)
          .and.have.property('accountNotFound', true);
      });
    });

    context('with missing account service', () => {
      it('should throw an error', async() => {
        usage.organization_id = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28';
        requestMock.setSpy(accountUri, { statusCode: 404, body: { } });

        await expect(accountClient.validateAccount(usage, undefined))
          .to.be.eventually.rejectedWith(Error, 'Account service not available')
          .and.not.have.property('accountNotFound');
      });
    });

    context('with an arbitrary communication error', () => {
      it('should throw an error and propagete the status code', async() => {
        usage.organization_id = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28';
        requestMock.setSpy(accountUri, { statusCode: 502 });

        await expect(accountClient.validateAccount(usage, undefined))
          .to.be.eventually.rejectedWith(Error, 'Error while communicating with Account service. Response code: 502')
          .and.not.have.property('accountNotFound');
      });
    });

    context('with unsupported account', () => {
      it('should throw with unsupported license type error', async() => {
        const unsupportedType = 'unsupported';

        const unsupportedAccount = extend({}, expectedAccount, { license_type: unsupportedType });
        usage.organization_id = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28';
        requestMock.setSpy(accountUri, { statusCode: 200, body: unsupportedAccount });

        await expect(accountClient.validateAccount(usage, undefined, [unsupportedType]))
          .to.be.eventually.rejectedWith(Error, `Unsupported license type "${unsupportedType}"`)
          .and.have.property('unsupportedLicense', true);
      });
    });
  });

});
