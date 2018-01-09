'use strict';

const requestMock = require('./request-mock.js');

const validator = require('../usage-validator.js');
const urienv = require('abacus-urienv');

/* eslint no-unused-expressions: 1 */

describe('usage validator tests', () => {
  const uris = urienv({
    provisioning: 9880,
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

  context('validate plan', () => {
    const provisioningUri = uris.provisioning +
    '/v1/provisioning/organizations/:organization_id/spaces/' +
    ':space_id/consumers/:consumer_id/resources/:resource_id/plans/' +
    ':plan_id/instances/:resource_instance_id/:time';

    context('with valid plan', () => {
      it('should not throw', async() => {
        requestMock.setSpy(provisioningUri, { statusCode: 200 });
        let expectedError = null;

        try {
          await validator.validatePlan(usage, undefined);
        } catch (error) {
          expectedError = error;
        }

        expect(expectedError).to.be.equal(null);
      });
    });

    context('with invalid plan', () => {
      it('should throw with valid error', async() => {
        requestMock.setSpy(provisioningUri, { statusCode: 404 });
        let actualError = null;
        const expectedError = { badRequest: true, err: 'Invalid plan' };

        try {
          await validator.validatePlan(usage, undefined);
        } catch (err) {
          actualError = err;
        }

        expect(actualError).to.deep.equal(expectedError);
      });
    });

    it('should call batchedGetRequest with valid arguments', async() => {
      const expectedAuth = 'auth';
      requestMock.setSpy(provisioningUri, { statusCode: 200 });
      let expectedError = null;

      try {
        await validator.validatePlan(usage, expectedAuth);
      } catch (error) {
        expectedError = error;
      }

      expect(expectedError).to.be.equal(null);
      expect(requestMock.getSpyCallParams(provisioningUri).headers.authorization).to.be.equal(expectedAuth);
      expect(requestMock.getSpyCallParams(provisioningUri).consumer_id).to.be.equal(usage.consumer_id);
      expect(requestMock.getSpyCallParams(provisioningUri).time).to.be.equal(usage.end);
      expect(requestMock.getSpyCallParams(provisioningUri)).to.deep.include(usage);
    });
  });

  context('validate schema', () => {
    context('with valid schema', () => {
      it('should not throw', (done) => {
        validator.validateSchema(usage);
        done();
      });
    });

    context('with invalid schema', () => {
      it('should throw with valid error', () => {
        let actualError = null;
        const expectedError = { badRequest: true, err: 'Invalid schema' };

        try {
          validator.validateSchema({ 'bla-bla': false });
        } catch (err) {
          actualError = err;
        }

        expect(actualError).to.deep.equal(expectedError);
      });
    });
  });

  context('validate account', () => {
    const accountUri = `${uris.account}/v1/organizations/:org_id/account/:time`;

    it('should work with cache', () => {

    });

    context('with valid account', () => {
      it('should not throw', async() => {
        requestMock.setSpy(accountUri, { statusCode: 200 });
        let expectedError = null;

        try {
          await validator.validateAccount(usage, undefined);
        } catch (err) {
          expectedError = err;
        }

        expect(expectedError).to.be.equal(null);
      });
    });

    context('with invalid account', () => {
      it('should throw with valid error', async() => {
        usage.organization_id = 'a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf28';
        requestMock.setSpy(accountUri, { statusCode: 404 });
        let actualError = null;
        const expectedError =
          { badRequest: true, err: `Unable to retrieve account info for ${usage.organization_id} at ${usage.end}` };

        try {
          await validator.validateAccount(usage, undefined);
        } catch (err) {
          actualError = err;
        }

        expect(actualError).to.deep.equal(expectedError);
      });
    });

  });
});
