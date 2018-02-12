'use strict';

const httpStatus = require('http-status-codes');


const abacusBatchModule = stubModule('abacus-batch');
const abacusRetryModule = stubModule('abacus-retry');
const abacusBreakerModule = stubModule('abacus-breaker');
const abacusRequestModule = stubModule('abacus-request');

describe('provisioning-plugin-client tests', () => {
  let sandbox;
  let ProvisioningPluginClient;
  let getStub;

  before(() => {
    sandbox = sinon.sandbox.create();
    getStub = sandbox.stub();
    abacusBatchModule.stubMainFunc((fn) => fn);
    abacusRetryModule.stubMainFunc((fn) => fn);
    abacusBreakerModule.stubMainFunc((fn) => fn);

    abacusRequestModule.stubProperties({
      get: getStub
    });
    ProvisioningPluginClient = require('../lib/provisioning-plugin-client');
  });

  describe('create ProvisioningPluginClient', () => {
    context('when no rootUrl is provided', () => {
      it('throws error', () => {
        expect(() => new ProvisioningPluginClient()).to.throw('Root URL is not provided.');
      });
    });
  });

  describe('getResourceType', () => {
    const resourceId = 1;
    const rootUrl = 'http://url.com';

    let provisioningPluginClient;

    context('when oauthToken is provided', () => {
      const token = 'token';
      const oauthToken = () => token;

      beforeEach(() => {
        provisioningPluginClient = new ProvisioningPluginClient(rootUrl, oauthToken);
      });

      context('when valid request is made', () => {
        const body = {
          property: 'value'
        };

        let resourceType;

        beforeEach(async() => {
          getStub.yields(undefined, {
            body,
            statusCode: httpStatus.OK
          });
          resourceType = await provisioningPluginClient.getResourceType(resourceId);
        });

        it('the response body is returned', () => {
          expect(resourceType).to.deep.equal(body);
          assert.calledWith(getStub,`${rootUrl}/v1/provisioning/resources/${resourceId}/type`, {
            cache: true,
            headers: {
              authorization: 'Bearer token'
            }
          });
        });
      });

      context('when provisioning responds with an error', () => {
        beforeEach(async() => {
          getStub.yields(undefined, {
            statusCode: httpStatus.NOT_FOUND
          });

        });

        it('an exception is thrown', async() => {
          let error;
          try {
            await provisioningPluginClient.getResourceType(resourceId);
          } catch (e) {
            error = e;
          }

          expect(error.message).to.include('Unable to retrieve resource type for resource');
        });
      });
    });

    context('when oauthToken is not provided', () => {
      beforeEach(async() => {
        provisioningPluginClient = new ProvisioningPluginClient(rootUrl);
        getStub.yields(undefined, { statusCode: httpStatus.OK });
        await provisioningPluginClient.getResourceType(resourceId);
      });

      it('no authorization header is sent to provisioning', () => {
        assert.calledWith(getStub,`${rootUrl}/v1/provisioning/resources/${resourceId}/type`, {
          cache: true
        });
      });
    });
  });


});
