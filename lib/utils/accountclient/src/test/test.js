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

  context('validate account', () => {

    const expectedAccount = { account_id: 'account_id', pricing_country: 'pricing_country' };

    context('with valid account', () => {
      it('should not throw', async() => {
        requestMock.setSpy(accountUri, { statusCode: 200, body: expectedAccount });
        try {
          const account = await accountClient.getAccount(usage, undefined);
          expect(account).to.deep.equal(expectedAccount);
        } catch (err) {
          expect(err).to.be.null;
        }
      });
    });

    context('with invalid account', () => {
      it('should throw with valid error', async() => {
        usage.organization_id = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28';
        requestMock.setSpy(accountUri, { statusCode: 404, body: { notfound: true } });
        let actualError = null;
        const expectedError =
          { badRequest: true, error: `Unable to retrieve account info for ${usage.organization_id} at ${usage.end}` };
        try {
          await accountClient.validateAccount(usage, undefined);
        } catch (err) {
          actualError = err;
        }
        expect(actualError).to.deep.equal(expectedError);
      });
    });

    context('with unsupported account', () => {
      it('should throw with unsupported license type error', async() => {
        const unsupportedType = 'unsupported';

        const unsupportedAccount = extend({}, expectedAccount, { license_type: unsupportedType });
        usage.organization_id = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28';
        requestMock.setSpy(accountUri, { statusCode: 200, body: unsupportedAccount });
        let actualError = null;
        const expectedError =
          { unsupportedLicense: true, error: `Unsupported license type ${unsupportedType}` };
        try {
          await accountClient.validateAccount(usage, undefined, [unsupportedType]);
        } catch (err) {
          actualError = err;
        }
        expect(actualError.msg).to.equal(expectedError.msg);
        expect(actualError.unsupportedLicense).to.be.true;
      });
    });
  });
});
